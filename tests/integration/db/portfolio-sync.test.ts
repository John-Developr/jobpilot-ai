import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDatabase, createUser } from "./harness";

let db: PGlite;
let alice: string;
let resumeIosId: string;

const sync = (snapshot: unknown) =>
  asUser(db, alice, () =>
    db.query<{ apply_portfolio_sync: Record<string, number> }>("select public.apply_portfolio_sync($1::jsonb)", [
      JSON.stringify(snapshot),
    ]),
  ).then((r) => r.rows[0]?.apply_portfolio_sync);

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  profile: { full_name: "John Carlo A. Ylana", headline: "Full Stack Developer", summary: "Bio.", phone: null, location: null },
  links: [{ ref: "profile.github_url", link_id: null, label: "GitHub", url: "https://github.com/jc", sort_order: 1 }],
  experiences: [
    {
      ref: "exp-ios",
      link_id: resumeIosId,
      company: "Forty Degrees Celsius, Inc.",
      title: "iOS Developer",
      location: null,
      employment_type: "full_time",
      start_date: "2024-01-01",
      end_date: null,
      is_current: true,
      description: null,
    },
    {
      ref: "exp-ai",
      link_id: null,
      company: "Forty Degrees Celsius, Inc.",
      title: "AI Engineer",
      location: null,
      employment_type: "full_time",
      start_date: "2025-12-01",
      end_date: null,
      is_current: true,
      description: null,
    },
  ],
  education: [{ ref: "edu-uc", link_id: null, institution: "University of Cebu - Main", degree: "BS IT", start_date: "2015-07-01", end_date: "2021-07-01", description: null }],
  skills: [
    { ref: "skill-swift", link_id: null, name: "Swift", category: "language", is_primary: false },
    { ref: "skill-kotlin", link_id: null, name: "Kotlin", category: "language", is_primary: false },
  ],
  projects: [
    {
      ref: "proj-nc",
      link_id: null,
      name: "NativeCamp",
      role: "iOS Developer",
      description: "Online lessons.",
      url: "https://nativecamp.net",
      repository_url: null,
      technologies: ["Swift"],
      highlights: ["Shipped Kids UI"],
      sort_order: 0,
    },
  ],
  ...overrides,
});

beforeAll(async () => {
  db = await createMigratedDatabase();
  alice = await createUser(db, "alice@example.com");
  await db.query("update public.profiles set location = 'Cebu City', years_of_experience = 5 where id = $1", [alice]);
  const ios = await db.query<{ id: string }>(
    `insert into public.professional_experiences
       (user_id, company, title, location, start_date, end_date, achievements, technologies)
     values ($1, 'Forty Degrees Celsius, Inc.', 'iOS Developer', 'Cebu City', '2024-01-01', '2025-12-01',
             '{"Fixed memory leaks"}', '{"SwiftUI"}') returning id`,
    [alice],
  );
  resumeIosId = ios.rows[0]?.id ?? "";
  await db.query(
    "insert into public.professional_skills (user_id, name, category, proficiency, is_primary) values ($1, 'Swift', 'language', 5, true)",
    [alice],
  );
}, 60_000);

describe("apply_portfolio_sync", () => {
  it("links, upserts and preserves JobPilot-only fields", async () => {
    const counts = await sync(snapshot());
    expect(counts).toMatchObject({ links: 1, experiences: 2, education: 1, projects: 1, skills: 1 });

    const ios = await db.query<{
      portfolio_ref: string;
      end_date: string | null;
      is_current: boolean;
      location: string;
      achievements: string[];
      technologies: string[];
    }>("select portfolio_ref, end_date::text, is_current, location, achievements, technologies from public.professional_experiences where id = $1", [resumeIosId]);
    // Portfolio wins on dates/current; local location kept because portfolio had none; bullets untouched.
    expect(ios.rows[0]).toEqual({
      portfolio_ref: "exp-ios",
      end_date: null,
      is_current: true,
      location: "Cebu City",
      achievements: ["Fixed memory leaks"],
      technologies: ["SwiftUI"],
    });

    const profile = await db.query<{ full_name: string; location: string; years_of_experience: number; synced: boolean }>(
      "select full_name, location, years_of_experience::float as years_of_experience, portfolio_synced_at is not null as synced from public.profiles where id = $1",
      [alice],
    );
    expect(profile.rows[0]).toEqual({ full_name: "John Carlo A. Ylana", location: "Cebu City", years_of_experience: 5, synced: true });
  });

  it("never duplicates a skill that already exists locally and keeps its details", async () => {
    const skills = await db.query<{ name: string; proficiency: number | null; is_primary: boolean }>(
      "select name, proficiency, is_primary from public.professional_skills where user_id = $1 order by name",
      [alice],
    );
    expect(skills.rows).toEqual([
      { name: "Kotlin", proficiency: null, is_primary: false },
      { name: "Swift", proficiency: 5, is_primary: true },
    ]);
  });

  it("is idempotent", async () => {
    await sync(snapshot());
    const count = async (t: string) =>
      (await db.query<{ n: number }>(`select count(*)::int n from public.${t} where user_id = $1`, [alice])).rows[0]?.n;
    expect({
      exp: await count("professional_experiences"),
      edu: await count("education"),
      links: await count("profile_links"),
      projects: await count("projects"),
      skills: await count("professional_skills"),
    }).toEqual({ exp: 2, edu: 1, links: 1, projects: 1, skills: 2 });
  });

  it("unlinks (never deletes) items removed from the portfolio", async () => {
    await sync(snapshot({ projects: [], skills: [] }));
    const project = await db.query<{ portfolio_ref: string | null }>(
      "select portfolio_ref from public.projects where user_id = $1",
      [alice],
    );
    expect(project.rows).toEqual([{ portfolio_ref: null }]);
    const linkedSkills = await db.query("select 1 from public.professional_skills where user_id = $1 and portfolio_ref is not null", [alice]);
    expect(linkedSkills.rows).toHaveLength(0);
  });

  it("cannot touch another user's rows and is denied to anon", async () => {
    const bob = await createUser(db, "bob@example.com");
    const bobExp = await db.query<{ id: string }>(
      "insert into public.professional_experiences (user_id, company, title, start_date) values ($1, 'X', 'Y', '2020-01-01') returning id",
      [bob],
    );
    await sync(snapshot({ experiences: [{ ...snapshot().experiences[0], ref: "steal", link_id: bobExp.rows[0]?.id }] }));
    const bobRow = await db.query<{ portfolio_ref: string | null }>(
      "select portfolio_ref from public.professional_experiences where id = $1",
      [bobExp.rows[0]?.id],
    );
    expect(bobRow.rows[0]?.portfolio_ref).toBeNull();

    await db.exec("set role anon");
    try {
      await expect(db.query("select public.apply_portfolio_sync('{}'::jsonb)")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
