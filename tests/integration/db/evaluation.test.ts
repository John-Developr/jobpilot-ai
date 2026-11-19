import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase, createUser, forceState } from "./harness";

let db: PGlite;
let alice: string;
let promptId: string;

async function newJob(userId: string, hash: string): Promise<string> {
  const result = await asUser(db, userId, () =>
    db.query<{ inserted_count: number }>("select * from public.ingest_jobs(null, $1::jsonb)", [
      JSON.stringify([{ url: `https://example.com/${hash}`, dedupe_hash: hash, title: "iOS Engineer", company: "Acme" }]),
    ]),
  );
  expect(result.rows[0]?.inserted_count).toBe(1);
  const job = await db.query<{ id: string }>("select id from public.jobs where user_id = $1 and dedupe_hash = $2", [userId, hash]);
  return job.rows[0]?.id ?? "";
}

const score = (overall: number, qualification: string) => ({
  overall_score: overall,
  qualification,
  criteria_scores: { technical_skills: { score: overall } },
  criteria_weights: { technical_skills: 30 },
  matched_skills: ["Swift"],
  missing_skills: ["Kotlin"],
  experience_gaps: [],
  positive_factors: ["Strong iOS"],
  negative_factors: [],
  explanation: "Good fit.",
  model: "test-model",
  prompt_version_id: promptId,
  input_hash: "a".repeat(64),
});

const record = (userId: string, jobId: string, s: unknown, status: string, requirements: unknown[] = []) =>
  asUser(db, userId, () =>
    db.query<{ record_job_evaluation: string }>("select public.record_job_evaluation($1, $2::jsonb, $3::jsonb, $4)", [
      jobId,
      JSON.stringify(s),
      JSON.stringify(requirements),
      status,
    ]),
  ).then((r) => r.rows[0]?.record_job_evaluation);

beforeAll(async () => {
  db = await createMigratedDatabase();
  alice = await createUser(db, "alice@example.com");
  const prompt = await db.query<{ id: string }>(
    "select id from public.prompt_versions where prompt_key = 'job.evaluate' and is_active",
  );
  promptId = prompt.rows[0]?.id ?? "";
}, 60_000);

describe("prompt seed", () => {
  it("has an active job.evaluate prompt with placeholders, readable by users", async () => {
    const rows = await asUser(db, alice, () =>
      db.query<{ template: string; version: number }>("select template, version from public.prompt_versions where prompt_key = 'job.evaluate' and is_active"),
    );
    expect(rows.rows[0]?.version).toBe(1);
    expect(rows.rows[0]?.template).toContain("{{profile}}");
    expect(rows.rows[0]?.template).toContain("{{job}}");
  });
});

describe("record_job_evaluation", () => {
  it("stores the score, requirements, status, match score and an event", async () => {
    const jobId = await newJob(alice, "eval-1");
    const status = await record(alice, jobId, score(88, "high_priority"), "qualified", [
      { kind: "skill", description: "Swift", is_required: true, min_years: 3 },
      { kind: "responsibility", description: "Ship features", is_required: false, min_years: null },
    ]);
    expect(status).toBe("qualified");

    const listing = await asUser(db, alice, () =>
      db.query<{ status: string; overall_score: number; qualification: string }>(
        "select status, overall_score, qualification from public.job_listings where id = $1",
        [jobId],
      ),
    );
    expect(listing.rows[0]).toEqual({ status: "qualified", overall_score: 88, qualification: "high_priority" });

    const app = await db.query<{ match_score: number; priority: number }>(
      "select match_score, priority from public.applications where job_id = $1",
      [jobId],
    );
    expect(app.rows[0]).toEqual({ match_score: 88, priority: 88 });

    const requirements = await db.query("select kind from public.job_requirements where job_id = $1", [jobId]);
    expect(requirements.rows).toHaveLength(2);

    const events = await db.query<{ event_type: string; to_status: string }>(
      "select e.event_type, e.to_status from public.application_events e join public.applications a on a.id = e.application_id where a.job_id = $1",
      [jobId],
    );
    expect(events.rows).toEqual([{ event_type: "job.evaluated", to_status: "qualified" }]);
  });

  it("re-evaluation replaces requirements and the listing shows the latest score", async () => {
    const jobId = await newJob(alice, "eval-2");
    await record(alice, jobId, score(60, "manual_review"), "discovered", [{ kind: "skill", description: "A" }]);
    await record(alice, jobId, score(40, "archive"), "archived", []);
    const listing = await db.query<{ overall_score: number; status: string }>(
      "select overall_score, status from public.job_listings where id = $1",
      [jobId],
    );
    expect(listing.rows[0]).toEqual({ overall_score: 40, status: "archived" });
    const requirements = await db.query("select 1 from public.job_requirements where job_id = $1", [jobId]);
    expect(requirements.rows).toHaveLength(0);
  });

  it("never changes the status of an application past the early stages", async () => {
    const jobId = await newJob(alice, "eval-3");
    await forceState(db, "update public.applications set status = 'interview' where job_id = $1", [jobId]);
    expect(await record(alice, jobId, score(30, "archive"), "archived")).toBe("interview");
  });

  it("rejects invalid statuses, other users and anon", async () => {
    const jobId = await newJob(alice, "eval-4");
    await expect(record(alice, jobId, score(90, "high_priority"), "applied")).rejects.toThrow(/invalid evaluation status/);
    const bob = await createUser(db, "bob@example.com");
    await expect(record(bob, jobId, score(90, "high_priority"), "qualified")).rejects.toThrow(/job not found/);
    await db.exec("set role anon");
    try {
      await expect(
        db.query("select public.record_job_evaluation(gen_random_uuid(), '{}'::jsonb, '[]'::jsonb, 'qualified')"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("lets the owner append AI usage rows but not edit them", async () => {
    await asUser(db, alice, () =>
      db.query(
        "insert into public.ai_usage_events (user_id, operation, model, input_tokens, output_tokens, succeeded) values ($1, 'job.evaluate', 'm', 10, 5, true)",
        [alice],
      ),
    );
    const updated = await asUser(db, alice, () =>
      db.query("update public.ai_usage_events set input_tokens = 0 where user_id = $1", [alice]),
    );
    expect(updated.affectedRows ?? 0).toBe(0);
  });
});
