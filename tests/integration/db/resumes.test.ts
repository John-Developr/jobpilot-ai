import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase, createUser } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;

async function createResume(userId: string, name: string, isDefault = false): Promise<string> {
  const result = await db.query<{ id: string }>(
    "insert into public.resumes (user_id, name, is_default) values ($1, $2, $3) returning id",
    [userId, name, isDefault],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Resume insert returned no row");
  return row.id;
}

async function defaults(userId: string): Promise<string[]> {
  const result = await db.query<{ name: string }>(
    "select name from public.resumes where user_id = $1 and is_default order by name",
    [userId],
  );
  return result.rows.map((row) => row.name);
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
}, 60_000);

describe("resumes", () => {
  it("allows only one default resume per user", async () => {
    await createResume(alice, "iOS", true);
    await expect(createResume(alice, "Web", true)).rejects.toThrow(/resumes_one_default_idx/);
  });

  it("set_default_resume moves the default atomically", async () => {
    const web = await createResume(alice, "Full-stack");
    await asUser(db, alice, () => db.query("select public.set_default_resume($1)", [web]));
    expect(await defaults(alice)).toEqual(["Full-stack"]);
  });

  it("set_default_resume refuses another user's resume", async () => {
    const bobs = await createResume(bob, "Bob resume", true);
    await expect(
      asUser(db, alice, () => db.query("select public.set_default_resume($1)", [bobs])),
    ).rejects.toThrow(/resume not found/);
    expect(await defaults(bob)).toEqual(["Bob resume"]);
  });

  it("set_default_resume is not callable by anon", async () => {
    await db.exec("set role anon");
    try {
      await expect(
        db.query("select public.set_default_resume(gen_random_uuid())"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("profile data", () => {
  it("rejects duplicate skills case-insensitively", async () => {
    await db.query("insert into public.professional_skills (user_id, name) values ($1, 'Swift')", [alice]);
    await expect(
      db.query("insert into public.professional_skills (user_id, name) values ($1, 'swift')", [alice]),
    ).rejects.toThrow(/professional_skills_unique_name/);
  });

  it("rejects a current job with an end date", async () => {
    await expect(
      db.query(
        `insert into public.professional_experiences (user_id, company, title, start_date, end_date, is_current)
         values ($1, 'Acme', 'Engineer', '2024-01-01', '2024-06-01', true)`,
        [alice],
      ),
    ).rejects.toThrow(/professional_experiences_current/);
  });

  it("rejects non-http links", async () => {
    await expect(
      db.query(
        "insert into public.profile_links (user_id, label, url) values ($1, 'x', 'javascript:alert(1)')",
        [alice],
      ),
    ).rejects.toThrow(/profile_links_url_check/);
  });

  it("lets the user edit profile fields but not the mirrored email", async () => {
    await asUser(db, alice, () =>
      db.query("update public.profiles set full_name = 'Alice' where id = $1", [alice]),
    );
    await expect(
      asUser(db, alice, () =>
        db.query("update public.profiles set email = 'x@example.com' where id = $1", [alice]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
