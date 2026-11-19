import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase, createUser, forceState } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;
let counter = 0;

async function newApplication(userId: string): Promise<string> {
  const hash = `queue-${++counter}`;
  await asUser(db, userId, () =>
    db.query("select * from public.ingest_jobs(null, $1::jsonb)", [
      JSON.stringify([{ url: `https://example.com/${hash}`, dedupe_hash: hash, title: "iOS Engineer", company: "Acme" }]),
    ]),
  );
  const row = await db.query<{ id: string }>(
    "select a.id from public.applications a join public.jobs j on j.id = a.job_id where j.user_id = $1 and j.dedupe_hash = $2",
    [userId, hash],
  );
  return row.rows[0]?.id ?? "";
}

const call = async <T>(userId: string, sql: string, params: unknown[]) =>
  (await asUser(db, userId, () => db.query<T>(sql, params))).rows[0];

/** Drafted, ready for approval. */
async function pendingApplication(userId: string): Promise<string> {
  const app = await newApplication(userId);
  await call(userId, "select public.save_application_document($1, 'cover_letter', 'Cover letter', 'Hello', 'ai', 'm', null, '{}')", [app]);
  await call(userId, "select public.mark_application_ready($1, false)", [app]);
  return app;
}

const approve = (userId: string, app: string, submitAfter: string | null = null) =>
  call<{ approve_application: string }>(userId, "select public.approve_application($1, $2)", [app, submitAfter]).then(
    (r) => r?.approve_application,
  );

const row = async (app: string) =>
  (
    await db.query<{
      status: string;
      approved_at: Date | null;
      scheduled_for: Date | null;
      resume_id: string | null;
      attempt_count: number;
      submission_method: string | null;
      submission_verified_at: Date | null;
      lock_token: string | null;
    }>("select * from public.applications where id = $1", [app])
  ).rows[0];

const events = async (app: string) =>
  (
    await db.query<{ event_type: string }>(
      "select event_type from public.application_events where application_id = $1 order by created_at, event_type",
      [app],
    )
  ).rows.map((r) => r.event_type);

async function asService<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

const dayBounds = () => {
  const start = new Date(Date.now() - 12 * 3600_000);
  return [start.toISOString(), new Date(start.getTime() + 24 * 3600_000).toISOString()];
};

const claim = (userId: string) =>
  asService(() =>
    db.query<{ application_id: string; lock_token: string; run_id: string; attempt: number }>(
      // Every application of the user is a candidate (as if every site had an adapter).
      "select * from public.claim_next_application($1, $2, $3, (select array_agg(id) from public.applications where user_id = $1))",
      [userId, ...dayBounds()],
    ),
  ).then((r) => r.rows[0]);

async function resetQueue(userId: string) {
  // Keep the claim tests independent: nothing else of this user is queued.
  await forceState(
    db,
    `update public.applications set status = 'archived', approved_at = null, scheduled_for = null,
       lock_token = null, locked_at = null where user_id = $1 and status in ('approved', 'scheduled', 'applying')`,
    [userId],
  );
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
  await db.query("insert into public.resumes (user_id, name, is_default) values ($1, 'Main', true)", [alice]);
}, 60_000);

describe("state machine", () => {
  it("rejects disallowed transitions from every writer, including the service role", async () => {
    const app = await newApplication(alice);
    await expect(db.query("update public.applications set status = 'interview' where id = $1", [app])).rejects.toThrow(
      /cannot change an application from discovered to interview/,
    );
    await expect(
      asService(() => db.query("update public.applications set status = 'applied' where id = $1", [app])),
    ).resolves.toBeDefined(); // discovered → applied is allowed (applied elsewhere)
  });

  it("requires a lock exactly while applying and an approval while queued", async () => {
    const app = await newApplication(alice);
    await expect(forceState(db, "update public.applications set status = 'applying' where id = $1", [app])).rejects.toThrow(
      /applications_claim_matches_status|applications_approval_recorded/,
    );
    await expect(forceState(db, "update public.applications set status = 'approved' where id = $1", [app])).rejects.toThrow(
      /applications_approval_recorded/,
    );
  });

  it("stops users from setting statuses or approval fields directly", async () => {
    const app = await newApplication(alice);
    for (const sql of [
      "update public.applications set status = 'qualified' where id = $1",
      "update public.applications set approved_at = now() where id = $1",
      "update public.applications set submitted_at = now() where id = $1",
    ]) {
      await expect(asUser(db, alice, () => db.query(sql, [app]))).rejects.toThrow(/permission denied/);
    }
  });
});

describe("approve_application", () => {
  it("approves for now or schedules for later, pins the default resume and logs it", async () => {
    const now = await pendingApplication(alice);
    expect(await approve(alice, now)).toBe("approved");
    const approved = await row(now);
    expect(approved?.approved_at).not.toBeNull();
    expect(approved?.scheduled_for).toBeNull();
    expect(approved?.resume_id).not.toBeNull();
    expect(await events(now)).toContain("application.approved");
    expect(await approve(alice, now)).toBe("approved"); // idempotent

    const later = await pendingApplication(alice);
    const at = new Date(Date.now() + 3600_000).toISOString();
    expect(await approve(alice, later, at)).toBe("scheduled");
    expect((await row(later))?.scheduled_for?.toISOString()).toBe(at);
  });

  it("requires verified answers, a resume and the ready step", async () => {
    const app = await pendingApplication(alice);
    await asUser(db, alice, () =>
      db.query(
        "insert into public.application_answers (user_id, application_id, question, answer, source) values ($1, $2, 'Why?', 'Because', 'ai')",
        [alice, app],
      ),
    );
    await expect(approve(alice, app)).rejects.toThrow(/verify every screening answer/);

    await expect(approve(alice, await newApplication(alice))).rejects.toThrow(/waiting for approval/);

    const bobApp = await pendingApplication(bob);
    await expect(approve(bob, bobApp)).rejects.toThrow(/choose a resume/);
    await expect(approve(bob, app)).rejects.toThrow(/application not found/);
  });
});

describe("approval stays tied to what the user approved", () => {
  it("withdraws approval when a document, answer or resume changes", async () => {
    const doc = await pendingApplication(alice);
    await approve(alice, doc);
    await call(alice, "select public.save_application_document($1, 'cover_letter', 'Cover letter', 'Edited', 'user', null, null, '{}')", [doc]);
    expect((await row(doc))?.status).toBe("pending_approval");
    expect((await row(doc))?.approved_at).toBeNull();

    const answer = await pendingApplication(alice);
    await approve(alice, answer, new Date(Date.now() + 3600_000).toISOString());
    await asUser(db, alice, () =>
      db.query(
        "insert into public.application_answers (user_id, application_id, question, answer, source, is_verified) values ($1, $2, 'Q', 'A', 'user', true)",
        [alice, answer],
      ),
    );
    expect((await row(answer))?.status).toBe("pending_approval");
    expect((await row(answer))?.scheduled_for).toBeNull();

    const resume = await pendingApplication(alice);
    await approve(alice, resume);
    await asUser(db, alice, () => db.query("update public.applications set resume_id = null where id = $1", [resume]));
    expect((await row(resume))?.status).toBe("pending_approval");
    expect(await events(resume)).toContain("application.approval_withdrawn");
  });

  it("locks documents while a worker is submitting", async () => {
    await resetQueue(alice);
    const app = await pendingApplication(alice);
    await approve(alice, app);
    await db.query("update public.automation_settings set is_enabled = true where user_id = $1", [alice]);
    expect((await claim(alice))?.application_id).toBe(app);
    await expect(
      call(alice, "select public.save_application_document($1, 'cover_letter', 'Cover letter', 'x', 'user', null, null, '{}')", [app]),
    ).rejects.toThrow(/being submitted/);
    await resetQueue(alice);
  });
});

describe("withdraw_approval and mark_application_submitted", () => {
  it("returns an approved application to the approval step", async () => {
    const app = await pendingApplication(alice);
    await approve(alice, app);
    expect(await call(alice, "select public.withdraw_approval($1) as s", [app])).toEqual({ s: "pending_approval" });
    expect((await row(app))?.approved_at).toBeNull();
  });

  it("records a manual submission from the queue or from an early stage", async () => {
    const queued = await pendingApplication(alice);
    await approve(alice, queued);
    expect(await call(alice, "select public.mark_application_submitted($1) as s", [queued])).toEqual({ s: "applied" });
    expect((await row(queued))?.submission_method).toBe("manual");

    const early = await newApplication(alice);
    expect(await call(alice, "select public.mark_application_submitted($1) as s", [early])).toEqual({ s: "applied" });
    await expect(call(bob, "select public.mark_application_submitted($1)", [early])).rejects.toThrow(/not found/);
  });
});

describe("submission worker contract", () => {
  it("is not callable by signed-in users", async () => {
    await expect(
      asUser(db, alice, () =>
        db.query("select * from public.claim_next_application($1, $2, $3, '{}')", [alice, ...dayBounds()]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("claims nothing while automation is off or paused", async () => {
    await resetQueue(alice);
    const app = await pendingApplication(alice);
    await approve(alice, app);
    await db.query("update public.automation_settings set is_enabled = false where user_id = $1", [alice]);
    expect(await claim(alice)).toBeUndefined();
    await db.query(
      "update public.automation_settings set is_enabled = true, is_paused = true, paused_at = now() where user_id = $1",
      [alice],
    );
    expect(await claim(alice)).toBeUndefined();
    await db.query("update public.automation_settings set is_paused = false, paused_at = null where user_id = $1", [alice]);
  });

  it("claims by priority, skips future schedules and writes a run", async () => {
    await resetQueue(alice);
    const low = await pendingApplication(alice);
    const high = await pendingApplication(alice);
    const future = await pendingApplication(alice);
    await approve(alice, low);
    await approve(alice, high);
    await approve(alice, future, new Date(Date.now() + 3600_000).toISOString());
    await db.query("update public.applications set priority = 90 where id = $1", [high]);

    const first = await claim(alice);
    expect(first?.application_id).toBe(high);
    expect(first?.attempt).toBe(1);
    const claimed = await row(high);
    expect(claimed?.status).toBe("applying");
    expect(claimed?.lock_token).toBe(first?.lock_token);
    const run = await db.query<{ status: string; kind: string }>("select status, kind from public.automation_runs where id = $1", [
      first?.run_id,
    ]);
    expect(run.rows[0]).toEqual({ status: "running", kind: "submission" });

    expect((await claim(alice))?.application_id).toBe(low);
    expect(await claim(alice)).toBeUndefined(); // only the future one is left
    await resetQueue(alice);
  });

  it("counts manual submissions and claims in flight against the daily limit", async () => {
    await resetQueue(alice);
    await db.query("update public.automation_settings set daily_application_limit = 1 where user_id = $1", [alice]);
    // Earlier tests already recorded manual submissions today.
    const app = await pendingApplication(alice);
    await approve(alice, app);
    expect(await claim(alice)).toBeUndefined();
    await db.query("update public.automation_settings set daily_application_limit = 100 where user_id = $1", [alice]);
    await resetQueue(alice);
  });

  it("retries retryable failures with backoff, then fails", async () => {
    await resetQueue(alice);
    await db.query("update public.automation_settings set max_retries = 1, retry_backoff_minutes = 30 where user_id = $1", [alice]);
    const app = await pendingApplication(alice);
    await approve(alice, app);
    const fail = (lock: string) =>
      asService(() =>
        db.query<{ s: string }>("select public.fail_application_attempt($1, $2, 'network', 'Timed out', true) as s", [app, lock]),
      ).then((r) => r.rows[0]?.s);

    const first = await claim(alice);
    expect(await fail(first?.lock_token ?? "")).toBe("scheduled");
    const retry = await row(app);
    expect(retry?.attempt_count).toBe(1);
    expect(retry?.scheduled_for?.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect(await claim(alice)).toBeUndefined(); // backoff not over

    await forceState(db, "update public.applications set scheduled_for = now() - interval '1 minute' where id = $1", [app]);
    const second = await claim(alice);
    expect(second?.attempt).toBe(2);
    expect(await fail(second?.lock_token ?? "")).toBe("failed");
    const run = await db.query<{ status: string }>("select status from public.automation_runs where id = $1", [second?.run_id]);
    expect(run.rows[0]?.status).toBe("needs_attention");
    await expect(fail(second?.lock_token ?? "")).rejects.toThrow(/claim not found/);
  });

  it("fails stale claims without retrying", async () => {
    await resetQueue(alice);
    const app = await pendingApplication(alice);
    await approve(alice, app);
    await claim(alice);
    await db.query("update public.applications set locked_at = now() - interval '2 hours' where id = $1", [app]);
    await claim(alice);
    const stale = await row(app);
    expect(stale?.status).toBe("failed");
    expect(stale?.lock_token).toBeNull();
  });

  it("releases a claim without counting an attempt", async () => {
    await resetQueue(alice);
    const app = await pendingApplication(alice);
    await approve(alice, app);
    const claimed = await claim(alice);
    const later = new Date(Date.now() + 3600_000).toISOString();
    const released = await asService(() =>
      db.query<{ s: string }>("select public.release_application_claim($1, $2, $3, 'Window closed') as s", [
        app,
        claimed?.lock_token,
        later,
      ]),
    );
    expect(released.rows[0]?.s).toBe("scheduled");
    expect((await row(app))?.attempt_count).toBe(0);
    const run = await db.query<{ status: string }>("select status from public.automation_runs where id = $1", [claimed?.run_id]);
    expect(run.rows[0]?.status).toBe("cancelled");
    await resetQueue(alice);
  });

  it("completes only with evidence and marks the submission verified", async () => {
    await resetQueue(alice);
    const app = await pendingApplication(alice);
    await approve(alice, app);
    const claimed = await claim(alice);
    const complete = (evidence: string) =>
      asService(() =>
        db.query<{ s: string }>("select public.complete_application_submission($1, $2, $3::jsonb) as s", [
          app,
          claimed?.lock_token,
          evidence,
        ]),
      );
    await expect(complete("{}")).rejects.toThrow(/evidence is required/);
    expect((await complete('{"confirmation_text":"Thanks for applying"}')).rows[0]?.s).toBe("applied");
    const done = await row(app);
    expect(done?.submission_method).toBe("automation");
    expect(done?.submission_verified_at).not.toBeNull();
    expect(done?.lock_token).toBeNull();
    expect(await events(app)).toEqual(
      expect.arrayContaining(["application.approved", "application.claimed", "application.submitted"]),
    );
  });
});
