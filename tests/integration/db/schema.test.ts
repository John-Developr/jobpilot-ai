import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase, createUser } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;

async function insertJob(userId: string, hash: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into public.jobs (user_id, url, dedupe_hash, title, company)
     values ($1, 'https://example.com/jobs/' || $2, $2, 'iOS Engineer', 'Acme') returning id`,
    [userId, hash],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Job insert returned no row");
  return row.id;
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
}, 60_000);

describe("new-user bootstrap", () => {
  it("creates profile, preferences and default automation settings", async () => {
    const settings = await db.query<{
      timezone: string;
      working_days: number[];
      window_start: string;
      window_end: string;
      daily_application_limit: number;
      require_approval: boolean;
      is_enabled: boolean;
    }>("select * from public.automation_settings where user_id = $1", [alice]);
    expect(settings.rows[0]).toMatchObject({
      timezone: "Asia/Manila",
      working_days: [1, 2, 3, 4, 5],
      window_start: "09:00:00",
      window_end: "17:00:00",
      daily_application_limit: 10,
      require_approval: true,
      is_enabled: false,
    });
    const profile = await db.query("select id from public.profiles where id = $1", [alice]);
    expect(profile.rows).toHaveLength(1);
    const prefs = await db.query("select user_id from public.job_preferences where user_id = $1", [alice]);
    expect(prefs.rows).toHaveLength(1);
  });
});

describe("row level security", () => {
  it("hides other users' rows", async () => {
    await insertJob(bob, "bob-only");
    const visible = await asUser(db, alice, () =>
      db.query("select id from public.jobs where dedupe_hash = 'bob-only'"),
    );
    expect(visible.rows).toHaveLength(0);
  });

  it("rejects inserting rows for another user", async () => {
    await expect(
      asUser(db, alice, () =>
        db.query(
          `insert into public.professional_skills (user_id, name) values ($1, 'Swift')`,
          [bob],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("lets the owner manage their own rows", async () => {
    const result = await asUser(db, alice, () =>
      db.query<{ name: string }>(
        `insert into public.professional_skills (user_id, name, category)
         values ($1, 'SwiftUI', 'framework') returning name`,
        [alice],
      ),
    );
    expect(result.rows[0]?.name).toBe("SwiftUI");
  });

  it("makes the application audit log append-only", async () => {
    const jobId = await insertJob(alice, "audit-job");
    const app = await db.query<{ id: string }>(
      "insert into public.applications (user_id, job_id) values ($1, $2) returning id",
      [alice, jobId],
    );
    const applicationId = app.rows[0]?.id;
    await asUser(db, alice, () =>
      db.query(
        `insert into public.application_events (user_id, application_id, event_type, actor)
         values ($1, $2, 'note.added', 'user')`,
        [alice, applicationId],
      ),
    );
    const updated = await asUser(db, alice, () =>
      db.query("update public.application_events set message = 'tampered' where user_id = $1", [alice]),
    );
    expect(updated.affectedRows ?? 0).toBe(0);
    await expect(
      asUser(db, alice, () =>
        db.query(
          `insert into public.application_events (user_id, application_id, event_type, actor)
           values ($1, $2, 'status.changed', 'automation')`,
          [alice, applicationId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("integrity constraints", () => {
  it("prevents duplicate jobs by dedupe hash", async () => {
    await insertJob(alice, "dup-hash");
    await expect(insertJob(alice, "dup-hash")).rejects.toThrow(/jobs_dedupe_unique/);
  });

  it("allows only one application per job", async () => {
    const jobId = await insertJob(alice, "one-app");
    await db.query("insert into public.applications (user_id, job_id) values ($1, $2)", [alice, jobId]);
    await expect(
      db.query("insert into public.applications (user_id, job_id) values ($1, $2)", [alice, jobId]),
    ).rejects.toThrow(/applications_one_per_job/);
  });

  it("blocks linking an application to another user's job", async () => {
    const bobJob = await insertJob(bob, "cross-user");
    await expect(
      db.query("insert into public.applications (user_id, job_id) values ($1, $2)", [alice, bobJob]),
    ).rejects.toThrow(/applications_job_fk/);
  });

  it("refuses an automated 'applied' status without verification", async () => {
    const jobId = await insertJob(alice, "unverified");
    await expect(
      db.query(
        `insert into public.applications (user_id, job_id, status, submission_method)
         values ($1, $2, 'applied', 'automation')`,
        [alice, jobId],
      ),
    ).rejects.toThrow(/applications_verified_automation/);
  });

  it("validates the automation window", async () => {
    await expect(
      db.query(
        "update public.automation_settings set window_start = '18:00', window_end = '09:00' where user_id = $1",
        [alice],
      ),
    ).rejects.toThrow(/automation_settings_window/);
  });
});

describe("column guards", () => {
  it("stops users from forging submission verification or locks", async () => {
    const jobId = await insertJob(alice, "guarded");
    await db.query("insert into public.applications (user_id, job_id) values ($1, $2)", [alice, jobId]);
    await expect(
      asUser(db, alice, () =>
        db.query("update public.applications set submission_verified_at = now() where job_id = $1", [jobId]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, alice, () =>
        db.query("update public.applications set lock_token = gen_random_uuid(), locked_at = now() where job_id = $1", [jobId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("still lets users update tracking fields", async () => {
    const jobId = await insertJob(alice, "tracking");
    await db.query("insert into public.applications (user_id, job_id) values ($1, $2)", [alice, jobId]);
    const result = await asUser(db, alice, () =>
      db.query<{ notes: string }>(
        "update public.applications set notes = 'Followed up', priority = 80 where job_id = $1 returning notes",
        [jobId],
      ),
    );
    expect(result.rows[0]?.notes).toBe("Followed up");
  });

  it("denies anon all table access", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.jobs")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("storage", () => {
  it("creates private buckets", async () => {
    const buckets = await db.query<{ id: string; public: boolean }>(
      "select id, public from storage.buckets order by id",
    );
    expect(buckets.rows).toEqual([
      { id: "automation", public: false },
      { id: "documents", public: false },
    ]);
  });

  it("restricts document objects to the owner's folder", async () => {
    await asUser(db, alice, () =>
      db.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
        `${alice}/resumes/cv.pdf`,
      ]),
    );
    await expect(
      asUser(db, alice, () =>
        db.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
          `${bob}/resumes/cv.pdf`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
