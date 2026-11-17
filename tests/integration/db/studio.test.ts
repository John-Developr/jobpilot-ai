import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase, createUser } from "./harness";

let db: PGlite;
let alice: string;

async function newApplication(userId: string, hash: string): Promise<string> {
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

const save = (userId: string, applicationId: string, kind: string, content: string, flags: string[] = []) =>
  asUser(db, userId, () =>
    db.query<{ save_application_document: number }>(
      "select public.save_application_document($1, $2, $3, $4, 'ai', 'm', null, $5)",
      [applicationId, kind, `${kind} title`, content, flags],
    ),
  ).then((r) => r.rows[0]?.save_application_document);

const ready = (userId: string, applicationId: string, confirm: boolean) =>
  asUser(db, userId, () =>
    db.query<{ mark_application_ready: string }>("select public.mark_application_ready($1, $2)", [applicationId, confirm]),
  ).then((r) => r.rows[0]?.mark_application_ready);

const status = async (applicationId: string) =>
  (await db.query<{ status: string }>("select status from public.applications where id = $1", [applicationId])).rows[0]?.status;

beforeAll(async () => {
  db = await createMigratedDatabase();
  alice = await createUser(db, "alice@example.com");
}, 60_000);

describe("save_application_document", () => {
  it("numbers versions per kind and moves the application to drafting", async () => {
    const app = await newApplication(alice, "studio-1");
    expect(await save(alice, app, "cover_letter", "v1")).toBe(1);
    expect(await save(alice, app, "cover_letter", "v2")).toBe(2);
    expect(await save(alice, app, "application_email", "e1")).toBe(1);
    expect(await status(app)).toBe("drafting");
    const events = await db.query("select 1 from public.application_events where application_id = $1 and event_type = 'application.drafting'", [app]);
    expect(events.rows).toHaveLength(1);
  });

  it("does not move applications that are past drafting", async () => {
    const app = await newApplication(alice, "studio-2");
    await db.query("update public.applications set status = 'interview' where id = $1", [app]);
    await save(alice, app, "recruiter_message", "hi");
    expect(await status(app)).toBe("interview");
  });

  it("refuses other users and oversized content", async () => {
    const app = await newApplication(alice, "studio-3");
    const bob = await createUser(db, "bob@example.com");
    await expect(save(bob, app, "cover_letter", "x")).rejects.toThrow(/application not found/);
    await expect(save(alice, app, "cover_letter", "x".repeat(50_001))).rejects.toThrow(/application_documents_content_length/);
  });
});

describe("mark_application_ready", () => {
  it("requires a cover letter or email", async () => {
    const app = await newApplication(alice, "studio-4");
    await save(alice, app, "resume_summary", "summary");
    await expect(ready(alice, app, false)).rejects.toThrow(/cover letter or application email/);
  });

  it("blocks on flags in the latest version unless confirmed", async () => {
    const app = await newApplication(alice, "studio-5");
    await save(alice, app, "cover_letter", "claims Kotlin", ["Mentions Kotlin, which is not in your profile."]);
    await expect(ready(alice, app, false)).rejects.toThrow(/unconfirmed grounding flags/);
    expect(await ready(alice, app, true)).toBe("pending_approval");
    expect(await ready(alice, app, false)).toBe("pending_approval"); // idempotent
  });

  it("only looks at the latest version of each document", async () => {
    const app = await newApplication(alice, "studio-6");
    await save(alice, app, "cover_letter", "flagged", ["x"]);
    await save(alice, app, "cover_letter", "fixed");
    expect(await ready(alice, app, false)).toBe("pending_approval");
  });

  it("refuses applications already past approval", async () => {
    const app = await newApplication(alice, "studio-7");
    await save(alice, app, "cover_letter", "ok");
    await db.query("update public.applications set status = 'approved' where id = $1", [app]);
    await expect(ready(alice, app, false)).rejects.toThrow(/already approved/);
  });
});

describe("prompts", () => {
  it("seeds an active v1 for every studio prompt", async () => {
    const rows = await db.query<{ prompt_key: string }>(
      "select prompt_key from public.prompt_versions where prompt_key like 'studio.%' and is_active order by prompt_key",
    );
    expect(rows.rows.map((r) => r.prompt_key)).toEqual([
      "studio.application_email",
      "studio.cover_letter",
      "studio.recruiter_message",
      "studio.resume_summary",
      "studio.screening_answer",
      "studio.skills_emphasis",
    ]);
  });
});
