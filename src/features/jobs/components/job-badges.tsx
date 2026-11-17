import { cn } from "@/lib/utils";
import { EMPLOYMENT_TYPE_LABELS, REMOTE_TYPE_LABELS } from "@/config/labels";
import type { DbEnum } from "@/types/database";

const pill = "inline-flex items-center rounded-md border px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap";

export function RemoteBadge({ value }: { value: DbEnum<"remote_type"> }) {
  if (value === "unknown") return null;
  return (
    <span className={cn(pill, value === "remote" ? "border-transparent bg-brand-soft text-brand-text" : "text-muted-foreground")}>
      {REMOTE_TYPE_LABELS[value]}
    </span>
  );
}

export function EmploymentBadge({ value }: { value: DbEnum<"employment_type"> | null }) {
  if (!value) return null;
  return <span className={cn(pill, "text-muted-foreground")}>{EMPLOYMENT_TYPE_LABELS[value]}</span>;
}

const STATUS_LABELS: Record<DbEnum<"application_status">, string> = {
  discovered: "New",
  analyzing: "Analyzing",
  qualified: "Qualified",
  drafting: "Drafting",
  pending_approval: "Pending approval",
  approved: "Approved",
  scheduled: "Scheduled",
  applying: "Applying",
  applied: "Applied",
  failed: "Failed",
  interview: "Interview",
  assessment: "Assessment",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

const STATUS_TONE: Partial<Record<DbEnum<"application_status">, string>> = {
  discovered: "bg-info-soft text-info",
  qualified: "bg-success-soft text-success",
  applied: "bg-success-soft text-success",
  interview: "bg-success-soft text-success",
  pending_approval: "bg-warning-soft text-warning",
  failed: "bg-destructive-soft text-destructive",
  rejected: "bg-destructive-soft text-destructive",
};

export function StatusBadge({ status }: { status: DbEnum<"application_status"> }) {
  return (
    <span className={cn(pill, "border-transparent", STATUS_TONE[status] ?? "bg-muted text-muted-foreground")}>
      {STATUS_LABELS[status]}
    </span>
  );
}
