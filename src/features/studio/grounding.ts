import { skillKey } from "@/features/profile/portfolio-mapping";
import { matchesKeywords } from "@/lib/integrations/job-sources/normalize";

/*
 * Grounding check for generated or edited documents (docs/ai/ai-architecture.md).
 * Heuristic and conservative: it flags, it never edits. Flags block "ready for approval"
 * until the user fixes the text or explicitly confirms it.
 */

export interface GroundingContext {
  /** skillKey()s of every verified skill and technology. */
  vocabulary: Set<string>;
  /** Skills the job asks for (requirements + evaluation's missing skills). */
  jobSkillTerms: string[];
  /** All verified facts and the job text as one string, for number checks. */
  sourceText: string;
}

const NUMBER = /(?<![\w.])\d+(?:[.,]\d+)?(?:\s?(?:%|\+|x\b|k\b|m\b))?/gi;

/** Digits of a numeric claim, e.g. "40%" → "40", "1,200+" → "1200". */
const digitsOf = (value: string) => value.replace(/[^\d.]/g, "").replace(/\.$/, "");

export function checkGrounding(content: string, context: GroundingContext): string[] {
  const flags: string[] = [];

  const seen = new Set<string>();
  for (const term of context.jobSkillTerms) {
    const key = skillKey(term);
    if (!key || seen.has(key) || context.vocabulary.has(key)) continue;
    seen.add(key);
    if (matchesKeywords({ title: content, tags: [] }, [term])) {
      flags.push(`Mentions "${term.trim()}", which is not in your verified profile.`);
    }
  }

  const sourceDigits = context.sourceText.replace(/,/g, "");
  const numbers = new Set<string>();
  for (const match of content.matchAll(NUMBER)) {
    const raw = match[0].trim();
    const digits = digitsOf(raw);
    if (!digits || numbers.has(digits)) continue;
    numbers.add(digits);
    if (!sourceDigits.includes(digits)) {
      flags.push(`The number "${raw}" does not appear in your profile or the job posting.`);
    }
  }

  return flags;
}
