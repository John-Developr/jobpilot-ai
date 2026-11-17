import type { DbEnum } from "@/types/database";

export type DocumentKind = Exclude<DbEnum<"document_kind">, "resume">;

/** The sections of an application package, each generated and versioned independently. */
export const DOCUMENT_KINDS = [
  "cover_letter",
  "application_email",
  "resume_summary",
  "skills_emphasis",
  "recruiter_message",
] as const satisfies readonly DocumentKind[];

export const DOCUMENT_CONFIG: Record<
  DocumentKind,
  { label: string; promptKey: string; description: string; signOff: string | null }
> = {
  cover_letter: {
    label: "Cover letter",
    promptKey: "studio.cover_letter",
    description: "A tailored letter built only from your verified profile.",
    signOff: "Sincerely,",
  },
  application_email: {
    label: "Application email",
    promptKey: "studio.application_email",
    description: "A short email to send with your resume attached.",
    signOff: "Best regards,",
  },
  resume_summary: {
    label: "Resume summary",
    promptKey: "studio.resume_summary",
    description: "Your professional summary rewritten for this job.",
    signOff: null,
  },
  skills_emphasis: {
    label: "Skills to emphasize",
    promptKey: "studio.skills_emphasis",
    description: "Which verified skills to lead with, and gaps to address honestly.",
    signOff: null,
  },
  recruiter_message: {
    label: "Recruiter message",
    promptKey: "studio.recruiter_message",
    description: "A short outreach note for a recruiter or hiring manager.",
    signOff: null,
  },
};

export function isDocumentKind(value: string): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value);
}

/**
 * Sign-off added by the app (never generated): the model never sees contact details.
 * Only fields the user filled in are included.
 */
export function buildSignature(
  kind: DocumentKind,
  contact: { fullName: string; email: string; phone: string; links: string[] },
): string {
  const signOff = DOCUMENT_CONFIG[kind].signOff;
  if (!signOff || !contact.fullName) return "";
  const details = [contact.email, contact.phone, ...contact.links.slice(0, 2)].filter(Boolean).join(" · ");
  return ["", "", signOff, contact.fullName, details].filter((line, index) => index < 2 || line).join("\n");
}
