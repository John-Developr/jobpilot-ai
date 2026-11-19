import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase, createUser } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;

const job = (hash: string) =>
  JSON.stringify([{ url: `https://example.com/${hash}`, dedupe_hash: hash, title: "iOS Engineer", company: "Acme" }]);

async function asService<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

const jobOwner = async (hash: string) =>
  (await db.query<{ user_id: string }>("select user_id from public.jobs where dedupe_hash = $1", [hash])).rows[0]?.user_id;

beforeAll(async () => {
  db = await createMigratedDatabase();
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
}, 60_000);

describe("ingest_jobs for workers", () => {
  it("lets the service role ingest for a given user", async () => {
    const result = await asService(() =>
      db.query<{ inserted_count: number }>("select * from public.ingest_jobs(null, $1::jsonb, $2)", [job("w-1"), alice]),
    );
    expect(result.rows[0]?.inserted_count).toBe(1);
    expect(await jobOwner("w-1")).toBe(alice);
  });

  it("keeps signed-in users acting as themselves", async () => {
    await asUser(db, alice, () => db.query("select * from public.ingest_jobs(null, $1::jsonb)", [job("w-2")]));
    expect(await jobOwner("w-2")).toBe(alice);
    await asUser(db, alice, () => db.query("select * from public.ingest_jobs(null, $1::jsonb, $2)", [job("w-3"), alice]));
    expect(await jobOwner("w-3")).toBe(alice);
    await expect(
      asUser(db, alice, () => db.query("select * from public.ingest_jobs(null, $1::jsonb, $2)", [job("w-4"), bob])),
    ).rejects.toThrow(/cannot act for another user/);
  });

  it("ignores a user id from callers that are not the service role", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(db.query("select * from public.ingest_jobs(null, $1::jsonb, $2)", [job("w-5"), bob])).rejects.toThrow(
        /not authenticated/,
      );
    } finally {
      await db.exec("reset role");
    }
    await expect(asService(() => db.query("select * from public.ingest_jobs(null, $1::jsonb)", [job("w-6")]))).rejects.toThrow(
      /not authenticated/,
    );
  });

  it("refuses another user's source", async () => {
    const source = await db.query<{ id: string }>(
      "insert into public.job_sources (user_id, connector_key, name, kind) values ($1, 'remoteok', 'Remote OK', 'api') returning id",
      [bob],
    );
    await expect(
      asService(() => db.query("select * from public.ingest_jobs($1, $2::jsonb, $3)", [source.rows[0]?.id, job("w-7"), alice])),
    ).rejects.toThrow(/job source not found/);
  });
});

describe("claim_next_application candidates", () => {
  it("claims only listed candidates", async () => {
    await asService(() => db.query("select * from public.ingest_jobs(null, $1::jsonb, $2)", [job("w-claim"), alice]));
    const app = await db.query<{ id: string }>(
      "select a.id from public.applications a join public.jobs j on j.id = a.job_id where j.dedupe_hash = 'w-claim'",
    );
    const id = app.rows[0]?.id;
    await db.query("insert into public.resumes (user_id, name, is_default) values ($1, 'Main', true)", [alice]);
    await asUser(db, alice, async () => {
      await db.query("select public.save_application_document($1, 'cover_letter', 'CL', 'Hello', 'ai', 'm', null, '{}')", [id]);
      await db.query("select public.mark_application_ready($1, false)", [id]);
      await db.query("select public.approve_application($1, null)", [id]);
    });
    await db.query("update public.automation_settings set is_enabled = true where user_id = $1", [alice]);
    const start = new Date(Date.now() - 3600_000).toISOString();
    const end = new Date(Date.now() + 3600_000).toISOString();
    const claim = (candidates: string[]) =>
      asService(() =>
        db.query<{ application_id: string }>("select * from public.claim_next_application($1, $2, $3, $4)", [
          alice,
          start,
          end,
          candidates,
        ]),
      ).then((r) => r.rows[0]);
    expect(await claim([])).toBeUndefined();
    expect(await claim([crypto.randomUUID()])).toBeUndefined();
    expect((await claim([id ?? ""]))?.application_id).toBe(id);
  });
});
