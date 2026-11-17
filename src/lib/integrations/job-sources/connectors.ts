import { z } from "zod";
import {
  cleanText,
  detectRemoteType,
  htmlToText,
  parseEmploymentType,
  parseSalaryPeriod,
  sanitizeSalary,
  toIsoDate,
} from "./normalize";
import type { NormalizedJob } from "./types";

/*
 * Payload parsers for each supported source. Pure: raw JSON in, NormalizedJob[] out.
 * Raw payloads are validated item by item; malformed items are skipped and counted.
 */

export interface ParseResult {
  jobs: NormalizedJob[];
  skipped: number;
}

function parseItems<T>(items: unknown[], schema: z.ZodType<T>, map: (item: T) => NormalizedJob | null): ParseResult {
  const jobs: NormalizedJob[] = [];
  let skipped = 0;
  for (const item of items) {
    const parsed = schema.safeParse(item);
    const job = parsed.success ? map(parsed.data) : null;
    if (job) jobs.push(job);
    else skipped += 1;
  }
  return { jobs, skipped };
}

/** "acme-corp" → "Acme Corp" for sources whose API does not return a company name. */
export function companyNameFromToken(token: string): string {
  return token
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const optionalString = z.string().nullish();

// --- Remote OK (https://remoteok.com/api) -------------------------------------
// Terms: link back to the Remote OK listing and name Remote OK as the source.

const remoteOkJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  url: z.string(),
  position: z.string(),
  company: z.string(),
  location: optionalString,
  date: optionalString,
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
  tags: z.array(z.string()).nullish(),
  description: optionalString,
});

export function parseRemoteOk(payload: unknown): ParseResult {
  if (!Array.isArray(payload)) return { jobs: [], skipped: 0 };
  // The first element is the API's legal notice, not a job.
  const items = payload.filter((item) => !(typeof item === "object" && item !== null && "legal" in item));
  return parseItems(items, remoteOkJobSchema, (job) => {
    const title = cleanText(job.position);
    const company = cleanText(job.company, 200);
    if (!title || !company) return null;
    return {
      externalId: String(job.id),
      url: job.url,
      title,
      company,
      location: cleanText(job.location),
      remoteType: "remote",
      employmentType: null,
      ...sanitizeSalary({ min: job.salary_min, max: job.salary_max, currency: "USD", period: "year" }),
      description: htmlToText(job.description),
      postedAt: toIsoDate(job.date),
      tags: job.tags ?? [],
    };
  });
}

// --- Greenhouse (boards-api.greenhouse.io) ------------------------------------

const greenhouseJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  absolute_url: z.string(),
  company_name: optionalString,
  location: z.object({ name: optionalString }).nullish(),
  first_published: optionalString,
  updated_at: optionalString,
  content: optionalString,
});

export function parseGreenhouse(payload: unknown, boardToken: string): ParseResult {
  const parsed = z.object({ jobs: z.array(z.unknown()) }).safeParse(payload);
  if (!parsed.success) return { jobs: [], skipped: 0 };
  return parseItems(parsed.data.jobs, greenhouseJobSchema, (job) => {
    const title = cleanText(job.title);
    if (!title) return null;
    const location = cleanText(job.location?.name);
    return {
      externalId: String(job.id),
      url: job.absolute_url,
      title,
      company: cleanText(job.company_name, 200) ?? companyNameFromToken(boardToken),
      location,
      remoteType: detectRemoteType(null, location, title),
      employmentType: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      description: htmlToText(job.content),
      postedAt: toIsoDate(job.first_published ?? job.updated_at),
      tags: [],
    };
  });
}

// --- Lever (api.lever.co/v0/postings) -----------------------------------------

const leverJobSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  createdAt: z.number().nullish(),
  workplaceType: optionalString,
  categories: z
    .object({ location: optionalString, commitment: optionalString, team: optionalString })
    .nullish(),
  descriptionPlain: optionalString,
  additionalPlain: optionalString,
  lists: z.array(z.object({ text: optionalString, content: optionalString })).nullish(),
  salaryRange: z
    .object({ min: z.number().nullish(), max: z.number().nullish(), currency: optionalString, interval: optionalString })
    .nullish(),
});

export function parseLever(payload: unknown, boardToken: string): ParseResult {
  if (!Array.isArray(payload)) return { jobs: [], skipped: 0 };
  return parseItems(payload, leverJobSchema, (job) => {
    const title = cleanText(job.text);
    if (!title) return null;
    const location = cleanText(job.categories?.location);
    const sections = [
      job.descriptionPlain,
      ...(job.lists ?? []).map((list) => [list.text, htmlToText(list.content)].filter(Boolean).join("\n")),
      job.additionalPlain,
    ].filter((part): part is string => Boolean(part && part.trim()));
    return {
      externalId: job.id,
      url: job.hostedUrl,
      title,
      company: companyNameFromToken(boardToken),
      location,
      remoteType: detectRemoteType(job.workplaceType === "unspecified" ? null : job.workplaceType, location, title),
      employmentType: parseEmploymentType(job.categories?.commitment),
      ...sanitizeSalary({
        min: job.salaryRange?.min,
        max: job.salaryRange?.max,
        currency: job.salaryRange?.currency,
        period: parseSalaryPeriod(job.salaryRange?.interval),
      }),
      description: htmlToText(sections.join("\n\n").replace(/\n/g, "<br>")),
      postedAt: toIsoDate(job.createdAt),
      tags: job.categories?.team ? [job.categories.team] : [],
    };
  });
}

// --- Ashby (api.ashbyhq.com/posting-api/job-board) ----------------------------

const ashbyJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  jobUrl: z.string(),
  isListed: z.boolean().nullish(),
  location: optionalString,
  employmentType: optionalString,
  workplaceType: optionalString,
  isRemote: z.boolean().nullish(),
  publishedAt: optionalString,
  department: optionalString,
  descriptionPlain: optionalString,
  descriptionHtml: optionalString,
  compensation: z
    .object({
      summaryComponents: z
        .array(
          z.object({
            compensationType: optionalString,
            interval: optionalString,
            currencyCode: optionalString,
            minValue: z.number().nullish(),
            maxValue: z.number().nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
});

export function parseAshby(payload: unknown, boardToken: string): ParseResult {
  const parsed = z.object({ jobs: z.array(z.unknown()) }).safeParse(payload);
  if (!parsed.success) return { jobs: [], skipped: 0 };
  return parseItems(parsed.data.jobs, ashbyJobSchema, (job) => {
    if (job.isListed === false) return null;
    const title = cleanText(job.title);
    if (!title) return null;
    const location = cleanText(job.location);
    const salary = job.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary");
    return {
      externalId: job.id,
      url: job.jobUrl,
      title,
      company: companyNameFromToken(boardToken),
      location,
      remoteType: detectRemoteType(job.workplaceType ?? (job.isRemote ? "remote" : null), location, title),
      employmentType: parseEmploymentType(job.employmentType),
      ...sanitizeSalary({
        min: salary?.minValue,
        max: salary?.maxValue,
        currency: salary?.currencyCode,
        period: parseSalaryPeriod(salary?.interval),
      }),
      description: job.descriptionPlain?.trim() ? job.descriptionPlain.trim().slice(0, 20_000) : htmlToText(job.descriptionHtml),
      postedAt: toIsoDate(job.publishedAt),
      tags: job.department ? [job.department] : [],
    };
  });
}
