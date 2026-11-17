import { cleanText, detectRemoteType, htmlToText, parseEmploymentType, parseSalaryPeriod, sanitizeSalary, toIsoDate } from "./normalize";
import type { NormalizedJob } from "./types";

/*
 * Extracts a schema.org JobPosting from page HTML (the structured data many career
 * pages publish for search engines). Pure; tolerant of the many shapes in the wild.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const asArray = (value: Json | undefined): Json[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]);
const str = (value: Json | undefined): string | null => (typeof value === "string" ? value : null);
const num = (value: Json | undefined): number | null =>
  typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)) ? Number(value) : null;

function isJobPosting(node: JsonObject): boolean {
  return asArray(node["@type"]).some((type) => type === "JobPosting");
}

function findJobPosting(node: Json): JsonObject | null {
  for (const item of asArray(node)) {
    if (!isObject(item)) continue;
    if (isJobPosting(item)) return item;
    const nested = findJobPosting(item["@graph"] ?? null);
    if (nested) return nested;
  }
  return null;
}

function locationText(posting: JsonObject): string | null {
  const parts = asArray(posting.jobLocation)
    .filter(isObject)
    .map((place) => {
      const address = isObject(place.address) ? place.address : null;
      if (!address) return str(place.name);
      const country = isObject(address.addressCountry) ? str(address.addressCountry.name) : str(address.addressCountry);
      return [str(address.addressLocality), str(address.addressRegion), country].filter(Boolean).join(", ");
    })
    .filter((part): part is string => Boolean(part));
  return cleanText([...new Set(parts)].join("; "));
}

export type JobPostingDraft = Omit<NormalizedJob, "externalId" | "tags" | "url">;

export function extractJobPosting(html: string): JobPostingDraft | null {
  const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, body] of scripts) {
    let data: Json;
    try {
      data = JSON.parse(body?.trim() ?? "") as Json;
    } catch {
      continue;
    }
    const posting = findJobPosting(data);
    if (!posting) continue;

    const title = cleanText(str(posting.title));
    const organization = asArray(posting.hiringOrganization).find(isObject);
    const company = cleanText(organization ? str(organization.name) : str(posting.hiringOrganization), 200);
    if (!title || !company) continue;

    const location = locationText(posting);
    const salary = isObject(posting.baseSalary) ? posting.baseSalary : null;
    const value = salary && isObject(salary.value) ? salary.value : null;
    const single = value ? num(value.value) : salary ? num(salary.value) : null;
    const employment = asArray(posting.employmentType).map(str).find(Boolean) ?? null;

    return {
      title,
      company,
      location,
      remoteType: detectRemoteType(str(posting.jobLocationType), location, title),
      employmentType: parseEmploymentType(employment),
      ...sanitizeSalary({
        min: value ? (num(value.minValue) ?? single) : single,
        max: value ? (num(value.maxValue) ?? single) : single,
        currency: salary ? str(salary.currency) : null,
        period: parseSalaryPeriod(value ? str(value.unitText) : salary ? str(salary.unitText) : null),
      }),
      description: htmlToText(str(posting.description)),
      postedAt: toIsoDate(str(posting.datePosted)),
    };
  }
  return null;
}
