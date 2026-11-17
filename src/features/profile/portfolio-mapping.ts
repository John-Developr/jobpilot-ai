import type { DbEnum } from "@/types/database";
import { fold, parseEmploymentType } from "@/lib/integrations/job-sources/normalize";
import type { PortfolioSnapshot } from "@/lib/integrations/portfolio/reader";

/*
 * Pure mapping from a portfolio snapshot to the `apply_portfolio_sync` payload.
 * Also decides which existing (e.g. resume-imported) rows are the same item, so
 * they are linked instead of duplicated. No I/O — unit tested.
 */

export interface LocalItems {
  links: { id: string; url: string; portfolioRef: string | null }[];
  experiences: { id: string; company: string; startDate: string; portfolioRef: string | null }[];
  education: { id: string; institution: string; portfolioRef: string | null }[];
  skills: { id: string; name: string; portfolioRef: string | null }[];
  projects: { id: string; name: string; portfolioRef: string | null }[];
}

/** A type alias (not an interface) so it is assignable to the RPC Json parameter. */
export type SyncPayload = {
  profile: { full_name: string | null; headline: string | null; summary: string | null; phone: string | null; location: string | null };
  links: { ref: string; link_id: string | null; label: string; url: string; sort_order: number }[];
  experiences: {
    ref: string;
    link_id: string | null;
    company: string;
    title: string;
    location: string | null;
    employment_type: DbEnum<"employment_type"> | null;
    start_date: string;
    end_date: string | null;
    is_current: boolean;
    description: string | null;
  }[];
  education: {
    ref: string;
    link_id: string | null;
    institution: string;
    degree: string | null;
    start_date: string | null;
    end_date: string | null;
    description: string | null;
  }[];
  skills: { ref: string; link_id: string | null; name: string; category: DbEnum<"skill_category">; is_primary: boolean }[];
  projects: {
    ref: string;
    link_id: string | null;
    name: string;
    role: string | null;
    description: string | null;
    url: string | null;
    repository_url: string | null;
    technologies: string[];
    highlights: string[];
    sort_order: number;
  }[];
};

export interface MappingResult {
  payload: SyncPayload;
  /** Items found in the portfolio but not imported, with the reason. */
  skipped: string[];
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const httpUrl = (value: string | null | undefined): string | null => {
  const url = text(value);
  return url && /^https?:\/\/\S+$/i.test(url) ? url : null;
};

/** Dates are month-precise in JobPilot. */
const monthStart = (date: string): string => `${date.slice(0, 7)}-01`;

const monthIndex = (date: string): number => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));

const urlKey = (url: string) =>
  url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");

/** "Acme, Inc." and "ACME Inc" are the same organization. */
const orgKey = (name: string) => fold(name).replace(/./g, "").replace(/s+/g, " ").trim();

/** "Vue.js" and "Vue", "Express.js" and "Express" are the same skill. */
export const skillKey = (name: string) => fold(name).replace(/\.?js$/, "").replace(/\s+/g, "");

const LINK_FIELDS = [
  ["website_url", "Website"],
  ["github_url", "GitHub"],
  ["linkedin_url", "LinkedIn"],
  ["booking_url", "Book a call"],
  ["x_url", "X"],
  ["facebook_url", "Facebook"],
  ["instagram_url", "Instagram"],
] as const;

const LANGUAGES = new Set(
  ["javascript", "typescript", "php", "python", "java", "swift", "objective-c", "kotlin", "dart", "go", "ruby", "c#", "c++", "c", "html", "css", "scss", "sql", "rust"].map(fold),
);

const CATEGORY_BY_SLUG: Record<string, DbEnum<"skill_category">> = {
  frontend: "framework",
  backend: "framework",
  mobile: "framework",
  databases: "database",
  "cloud-devops": "cloud",
  "ai-ml": "tool",
  cms: "platform",
  integrations: "platform",
  security: "practice",
  tools: "tool",
};

export function skillCategory(name: string, slug: string | null): DbEnum<"skill_category"> {
  if (LANGUAGES.has(fold(name))) return "language";
  return (slug && CATEGORY_BY_SLUG[slug]) || "other";
}

/** Picks the first unlinked local row satisfying `matches`, consuming it. */
function claim<T extends { id: string; portfolioRef: string | null }>(
  pool: T[],
  matches: (item: T) => boolean,
): string | null {
  const index = pool.findIndex((item) => item.portfolioRef === null && matches(item));
  if (index === -1) return null;
  const [item] = pool.splice(index, 1);
  return item?.id ?? null;
}

export function mapPortfolioSnapshot(snapshot: PortfolioSnapshot, local: LocalItems): MappingResult {
  const skipped: string[] = [];
  const linkedRefs = (items: { portfolioRef: string | null }[]) => new Set(items.map((i) => i.portfolioRef).filter(Boolean));

  // Profile + links ------------------------------------------------------------
  const p = snapshot.profile;
  const profile = {
    full_name: text(p?.full_name),
    headline: text(p?.headline),
    summary: text(p?.bio),
    phone: text(p?.phone),
    location: text(p?.location),
  };

  const linkPool = [...local.links];
  const alreadyLinked = linkedRefs(local.links);
  const links: SyncPayload["links"] = [];
  LINK_FIELDS.forEach(([field, label], index) => {
    const url = httpUrl(p?.[field]);
    if (!url) return;
    const ref = `profile.${field}`;
    links.push({
      ref,
      link_id: alreadyLinked.has(ref) ? null : claim(linkPool, (l) => urlKey(l.url) === urlKey(url)),
      label,
      url,
      sort_order: 100 + index,
    });
  });

  // Experience and education (one portfolio timeline) ---------------------------
  const experiencePool = [...local.experiences];
  const educationPool = [...local.education];
  const experiences: SyncPayload["experiences"] = [];
  const education: SyncPayload["education"] = [];

  for (const entry of snapshot.experiences) {
    if (entry.entry_type === "milestone") {
      skipped.push(`Milestone "${entry.position}" (not an experience entry)`);
      continue;
    }
    const start = monthStart(entry.start_date);
    const end = entry.end_date ? monthStart(entry.end_date) : null;

    if (entry.entry_type === "education") {
      const institution = orgKey(entry.company);
      education.push({
        ref: entry.id,
        link_id: claim(educationPool, (e) => {
          const local = orgKey(e.institution);
          return local.includes(institution) || institution.includes(local);
        }),
        institution: entry.company.trim(),
        degree: text(entry.position),
        start_date: start,
        end_date: end,
        description: text(entry.description),
      });
      continue;
    }

    const company = orgKey(entry.company);
    const sameCompany = (e: LocalItems["experiences"][number]) => orgKey(e.company) === company;
    experiences.push({
      ref: entry.id,
      // Exact start month first, then ±1 month (portfolio and resume dates often differ slightly).
      link_id:
        claim(experiencePool, (e) => sameCompany(e) && monthIndex(e.startDate) === monthIndex(start)) ??
        claim(experiencePool, (e) => sameCompany(e) && Math.abs(monthIndex(e.startDate) - monthIndex(start)) <= 1),
      company: entry.company.trim(),
      title: entry.position.trim(),
      location: text(entry.location),
      employment_type: parseEmploymentType(entry.employment_type),
      start_date: start,
      end_date: end,
      is_current: end === null,
      description: text(entry.description),
    });
  }

  // Skills -----------------------------------------------------------------------
  const skillPool = [...local.skills];
  const skillRefs = linkedRefs(local.skills);
  const seen = new Set<string>();
  const skills: SyncPayload["skills"] = [];
  for (const skill of snapshot.skills) {
    const key = skillKey(skill.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    skills.push({
      ref: skill.id,
      link_id: skillRefs.has(skill.id) ? null : claim(skillPool, (s) => skillKey(s.name) === key),
      name: skill.name.trim(),
      category: skillCategory(skill.name, skill.category_slug),
      is_primary: skill.is_core,
    });
  }

  // Projects ---------------------------------------------------------------------
  const projectPool = [...local.projects];
  const projects: SyncPayload["projects"] = snapshot.projects.map((project) => ({
    ref: project.id,
    link_id: claim(projectPool, (l) => fold(l.name) === fold(project.title)),
    name: project.title.trim(),
    role: text(project.role),
    description: text(project.description) ?? text(project.tagline),
    url: httpUrl(project.live_url),
    repository_url: httpUrl(project.source_url),
    technologies: project.tech.map((t) => t.trim()).filter(Boolean),
    highlights: project.highlights.map((h) => h.trim()).filter(Boolean),
    sort_order: project.sort_order,
  }));

  return { payload: { profile, links, experiences, education, skills, projects }, skipped };
}
