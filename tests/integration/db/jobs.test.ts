import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase, createUser, forceState } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;
let aliceSource: string;
let bobSource: string;

const job = (overrides: Record<string, unknown> = {}) => ({
  external_id: "1",
  url: "https://example.com/jobs/1",
  dedupe_hash: "hash-1",
  title: "iOS Engineer",
  company: "Acme",
  location: "Remote",
  remote_type: "remote",
  employment_type: "full_time",
  salary_min: 100000,
  salary_max: 150000,
  salary_currency: "USD",
  salary_period: "year",
  description: "Build apps.",
  posted_at: "2026-11-01T00:00:00Z",
  ...overrides,
});

async function createSource(userId: string, key: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    "insert into public.job_sources (user_id, connector_key, name, kind) values ($1, $2, $2, 'api') returning id",
    [userId, key],
  );
  const row = result.rows[0];
  if (!row) throw new Error("source insert returned no row");
  return row.id;
}

async function ingest(userId: string, sourceId: string | null, jobs: unknown[]) {
  const result = await asUser(db, userId, () =>
    db.query<{ inserted_count: number; skipped_count: number }>(
      "select * from public.ingest_jobs($1, $2::jsonb)",
      [sourceId, JSON.stringify(jobs)],
    ),
  );
  return result.rows[0];
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
  aliceSource = await createSource(alice, "remoteok");
  bobSource = await createSource(bob, "remoteok");
}, 60_000);

describe("ingest_jobs", () => {
  it("inserts jobs with a discovered application each", async () => {
    expect(await ingest(alice, aliceSource, [job()])).toEqual({ inserted_count: 1, skipped_count: 0 });
    const listing = await asUser(db, alice, () =>
      db.query<{ status: string; source_key: string }>(
        "select status, source_key from public.job_listings where url = 'https://example.com/jobs/1'",
      ),
    );
    expect(listing.rows).toEqual([{ status: "discovered", source_key: "remoteok" }]);
  });

  it("skips duplicates by hash, URL and external id — including within one batch", async () => {
    const result = await ingest(alice, aliceSource, [
      job(), // same everything
      job({ external_id: "2", dedupe_hash: "hash-2" }), // same URL
      job({ url: "https://example.com/jobs/3", dedupe_hash: "hash-3" }), // same source external id
      job({ external_id: "4", url: "https://example.com/jobs/4", dedupe_hash: "hash-1" }), // same hash
      job({ external_id: "5", url: "https://example.com/jobs/5", dedupe_hash: "hash-5" }), // new
      job({ external_id: "5b", url: "https://example.com/jobs/5", dedupe_hash: "hash-5b" }), // dup in batch
    ]);
    expect(result).toEqual({ inserted_count: 1, skipped_count: 5 });
  });

  it("defaults a missing remote type to unknown and allows manual (null source) jobs", async () => {
    await ingest(alice, null, [
      job({ external_id: null, url: "https://example.com/manual", dedupe_hash: "manual", remote_type: null }),
    ]);
    const row = await db.query<{ remote_type: string; source_id: string | null }>(
      "select remote_type, source_id from public.jobs where dedupe_hash = 'manual'",
    );
    expect(row.rows[0]).toEqual({ remote_type: "unknown", source_id: null });
  });

  it("refuses another user's source", async () => {
    await expect(ingest(alice, bobSource, [job({ dedupe_hash: "x", url: "https://x.dev/1" })])).rejects.toThrow(
      /job source not found/,
    );
  });

  it("keeps users isolated: the same job can exist for two users", async () => {
    expect(await ingest(bob, bobSource, [job()])).toEqual({ inserted_count: 1, skipped_count: 0 });
    const visible = await asUser(db, alice, () => db.query("select id from public.job_listings"));
    const aliceJobs = await db.query("select id from public.jobs where user_id = $1", [alice]);
    expect(visible.rows).toHaveLength(aliceJobs.rows.length);
  });

  it("rejects a non-array payload and anon callers", async () => {
    await expect(
      asUser(db, alice, () => db.query("select * from public.ingest_jobs(null, '{}'::jsonb)")),
    ).rejects.toThrow(/must be a JSON array/);
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.ingest_jobs(null, '[]'::jsonb)")).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.query("select * from public.job_listings")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("set_job_archived", () => {
  async function jobId(hash: string): Promise<string> {
    const result = await db.query<{ id: string }>(
      "select id from public.jobs where user_id = $1 and dedupe_hash = $2",
      [alice, hash],
    );
    const row = result.rows[0];
    if (!row) throw new Error("job not found");
    return row.id;
  }

  const archive = (id: string, archived: boolean) =>
    asUser(db, alice, () =>
      db.query<{ set_job_archived: string }>("select public.set_job_archived($1, $2)", [id, archived]),
    ).then((result) => result.rows[0]?.set_job_archived);

  it("archives and restores with audit events", async () => {
    const id = await jobId("hash-1");
    expect(await archive(id, true)).toBe("archived");
    expect(await archive(id, true)).toBe("archived"); // idempotent
    expect(await archive(id, false)).toBe("discovered");
    const events = await db.query<{ event_type: string; from_status: string; to_status: string }>(
      `select e.event_type, e.from_status, e.to_status from public.application_events e
       join public.applications a on a.id = e.application_id
       where a.job_id = $1 order by e.created_at, e.event_type`,
      [id],
    );
    expect(events.rows.map((row) => row.event_type).sort()).toEqual(["job.archived", "job.restored"]);
  });

  it("refuses to archive a submitted application", async () => {
    const id = await jobId("hash-5");
    await forceState(db, "update public.applications set status = 'applied', submission_method = 'manual' where job_id = $1", [id]);
    await expect(archive(id, true)).rejects.toThrow(/cannot archive/);
  });

  it("refuses another user's job", async () => {
    const bobJob = await db.query<{ id: string }>("select id from public.jobs where user_id = $1 limit 1", [bob]);
    await expect(archive(bobJob.rows[0]?.id ?? "", true)).rejects.toThrow(/job not found/);
  });
});
