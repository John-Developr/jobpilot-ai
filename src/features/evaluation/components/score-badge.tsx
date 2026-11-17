import { cn } from "@/lib/utils";
import type { DbEnum } from "@/types/database";

export const QUALIFICATION_LABELS: Record<DbEnum<"qualification_level">, string> = {
  high_priority: "High priority",
  recommended: "Recommended",
  manual_review: "Manual review",
  archive: "Low match",
};

const TONE: Record<DbEnum<"qualification_level">, string> = {
  high_priority: "bg-success-soft text-success",
  recommended: "bg-info-soft text-info",
  manual_review: "bg-warning-soft text-warning",
  archive: "bg-muted text-muted-foreground",
};

export function ScoreBadge({
  score,
  qualification,
  size = "sm",
}: {
  score: number;
  qualification: DbEnum<"qualification_level">;
  size?: "sm" | "lg";
}) {
  return (
    <span
      title={`${QUALIFICATION_LABELS[qualification]} · ${score}/100`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-semibold whitespace-nowrap tabular-nums",
        size === "sm" ? "px-1.5 py-0.5 text-2xs" : "px-2.5 py-1 text-sm",
        TONE[qualification],
      )}
    >
      <span className={size === "lg" ? "text-lg font-bold" : undefined}>{score}</span>
      <span className="font-medium">{QUALIFICATION_LABELS[qualification]}</span>
    </span>
  );
}
