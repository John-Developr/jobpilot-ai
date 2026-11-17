import { describe, expect, it } from "vitest";
import { mapPortfolioSnapshot, skillCategory, skillKey, type LocalItems } from "@/features/profile/portfolio-mapping";
import type { PortfolioSnapshot } from "@/lib/integrations/portfolio/reader";

/** Synthetic snapshot shaped like the portfolio seed data (no personal details). */
const snapshot: PortfolioSnapshot = {
  profile: {
    id: "p1",
    full_name: " Jane Dev ",
    headline: "Full Stack Developer",
    bio: "Builds things.",
    phone: null,
    location: "",
    website_url: null,
    github_url: "https://github.com/jane",
    linkedin_url: "https://www.linkedin.com/in/jane/",
    booking_url: "javascript:alert(1)",
    facebook_url: null,
    instagram_url: null,
    x_url: null,
  },
  experiences: [
    { id: "m1", entry_type: "milestone", company: "Hello world", position: "First code", employment_type: null, location: null, start_date: "2015-06-01", end_date: null, description: null },
    { id: "e1", entry_type: "education", company: "University of Cebu - Main", position: "BS Information Technology", employment_type: null, location: null, start_date: "2015-07-01", end_date: "2021-07-01", description: null },
    { id: "w1", entry_type: "work", company: "Acme, Inc.", position: "iOS Developer", employment_type: "Full-time", location: null, start_date: "2024-01-15", end_date: null, description: null },
    { id: "w2", entry_type: "work", company: "Acme, Inc.", position: "AI Engineer", employment_type: "Full-time", location: null, start_date: "2025-12-01", end_date: null, description: null },
    { id: "w3", entry_type: "work", company: "Other Co", position: "Dev", employment_type: "Freelance", location: null, start_date: "2020-01-01", end_date: "2021-01-01", description: "Did work." },
  ],
  projects: [
    { id: "pr1", title: "NativeCamp", tagline: "Lessons app", description: null, role: "iOS Developer", organization: "Acme", highlights: [" Kids UI "], tech: ["Swift", ""], live_url: "https://nativecamp.net", source_url: "not a url", sort_order: 2 },
  ],
  skills: [
    { id: "s1", name: "Swift", is_core: false, category_slug: "mobile" },
    { id: "s2", name: "Vue.js", is_core: false, category_slug: "frontend" },
    { id: "s3", name: "Supabase", is_core: true, category_slug: "databases" },
    { id: "s4", name: "Vue", is_core: false, category_slug: "frontend" },
  ],
};

const local: LocalItems = {
  links: [{ id: "L-gh", url: "https://GitHub.com/jane/", portfolioRef: null }],
  experiences: [
    { id: "X-ios", company: "Acme, Inc.", startDate: "2024-01-01", portfolioRef: null },
    { id: "X-ai", company: "ACME Inc", startDate: "2026-01-01", portfolioRef: null },
  ],
  education: [{ id: "D-uc", institution: "University of Cebu - Main Campus", portfolioRef: null }],
  skills: [
    { id: "K-swift", name: "swift", portfolioRef: null },
    { id: "K-vue", name: "Vue", portfolioRef: null },
  ],
  projects: [],
};

describe("mapPortfolioSnapshot", () => {
  const { payload, skipped } = mapPortfolioSnapshot(snapshot, local);

  it("maps the profile, trimming and dropping empty values", () => {
    expect(payload.profile).toEqual({
      full_name: "Jane Dev",
      headline: "Full Stack Developer",
      summary: "Builds things.",
      phone: null,
      location: null,
    });
  });

  it("maps only valid http(s) links and links matching local URLs", () => {
    expect(payload.links).toEqual([
      { ref: "profile.github_url", link_id: "L-gh", label: "GitHub", url: "https://github.com/jane", sort_order: 101 },
      { ref: "profile.linkedin_url", link_id: null, label: "LinkedIn", url: "https://www.linkedin.com/in/jane/", sort_order: 102 },
    ]);
  });

  it("links experience by company and start month, allowing one month of drift", () => {
    expect(payload.experiences.map((e) => [e.ref, e.link_id])).toEqual([
      ["w1", "X-ios"],
      ["w2", "X-ai"],
      ["w3", null],
    ]);
    expect(payload.experiences[0]).toMatchObject({
      start_date: "2024-01-01",
      end_date: null,
      is_current: true,
      employment_type: "full_time",
    });
    expect(payload.experiences[2]).toMatchObject({ is_current: false, end_date: "2021-01-01", employment_type: "freelance" });
  });

  it("routes education entries and links similar institution names", () => {
    expect(payload.education).toEqual([
      {
        ref: "e1",
        link_id: "D-uc",
        institution: "University of Cebu - Main",
        degree: "BS Information Technology",
        start_date: "2015-07-01",
        end_date: "2021-07-01",
        description: null,
      },
    ]);
    expect(skipped).toEqual(['Milestone "First code" (not an experience entry)']);
  });

  it("links skills case- and .js-insensitively and drops duplicates", () => {
    expect(payload.skills).toEqual([
      { ref: "s1", link_id: "K-swift", name: "Swift", category: "language", is_primary: false },
      { ref: "s2", link_id: "K-vue", name: "Vue.js", category: "framework", is_primary: false },
      { ref: "s3", link_id: null, name: "Supabase", category: "database", is_primary: true },
    ]);
  });

  it("maps projects with tagline fallback and URL validation", () => {
    expect(payload.projects).toEqual([
      {
        ref: "pr1",
        link_id: null,
        name: "NativeCamp",
        role: "iOS Developer",
        description: "Lessons app",
        url: "https://nativecamp.net",
        repository_url: null,
        technologies: ["Swift"],
        highlights: ["Kids UI"],
        sort_order: 2,
      },
    ]);
  });

  it("never re-links rows that already belong to the portfolio", () => {
    const relinked = mapPortfolioSnapshot(snapshot, {
      ...local,
      experiences: [{ id: "X-ios", company: "Acme, Inc.", startDate: "2024-01-01", portfolioRef: "w1" }],
    });
    expect(relinked.payload.experiences.every((e) => e.link_id === null)).toBe(true);
  });

  it("handles an empty portfolio", () => {
    const empty = mapPortfolioSnapshot({ profile: null, experiences: [], projects: [], skills: [] }, local);
    expect(empty.payload.links).toEqual([]);
    expect(empty.payload.profile.full_name).toBeNull();
  });
});

describe("helpers", () => {
  it("normalizes skill keys", () => {
    expect(skillKey("Express.js")).toBe(skillKey("Express"));
    expect(skillKey("Node.js")).toBe(skillKey("node"));
    expect(skillKey("React Native")).not.toBe(skillKey("React"));
  });

  it("maps categories with a language override", () => {
    expect(skillCategory("TypeScript", "frontend")).toBe("language");
    expect(skillCategory("Docker", "cloud-devops")).toBe("cloud");
    expect(skillCategory("Mystery", "unknown-slug")).toBe("other");
    expect(skillCategory("Mystery", null)).toBe("other");
  });
});
