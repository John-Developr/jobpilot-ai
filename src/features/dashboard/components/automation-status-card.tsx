import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { evaluateSubmissionWindow, type WindowClosedReason } from "@/lib/scheduling/submission-window";
import { EmergencyPauseButton } from "@/features/settings/components/emergency-pause-button";
import { WEEKDAY_OPTIONS } from "@/features/settings/schemas";
import type { AutomationSettings } from "@/features/settings/server/automation-settings-repository";

const CLOSED_LABEL: Record<WindowClosedReason, string> = {
  disabled: "Automation off",
  paused: "Paused",
  non_working_day: "Closed · non-working day",
  before_window: "Closed · before hours",
  after_window: "Closed · after hours",
};

function formatInZone(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

interface AutomationStatusCardProps {
  settings: AutomationSettings;
  /** Server time at render. */
  now: Date;
}

export function AutomationStatusCard({ settings, now }: AutomationStatusCardProps) {
  const status = evaluateSubmissionWindow(now, settings);
  const days = WEEKDAY_OPTIONS.filter((day) => settings.workingDays.includes(day.value))
    .map((day) => day.label)
    .join(", ");

  const tone = status.open ? "success" : status.reason === "paused" ? "destructive" : "muted";
  const label = status.open ? "Window open" : CLOSED_LABEL[status.reason];
  const detail = status.open
    ? `Closes ${formatInZone(status.windowEnd, settings.timezone)}`
    : status.nextWindowStart
      ? `Next window ${formatInZone(status.nextWindowStart, settings.timezone)}`
      : status.reason === "paused"
        ? (settings.pausedReason ?? "Submissions are blocked until resumed.")
        : "Enable automated submissions in Settings.";

  return (
    <SectionCard
      title="Submission window"
      icon={CalendarClock}
      action={<EmergencyPauseButton isPaused={settings.isPaused} />}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold",
              tone === "success" && "bg-success-soft text-success",
              tone === "destructive" && "bg-destructive-soft text-destructive",
              tone === "muted" && "bg-muted text-muted-foreground",
            )}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            {label}
          </span>
          <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings">Edit schedule</Link>
        </Button>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-2xs text-subtle-foreground uppercase">Days</dt>
          <dd className="mt-0.5 font-medium">{days || "None"}</dd>
        </div>
        <div>
          <dt className="text-2xs text-subtle-foreground uppercase">Hours</dt>
          <dd className="mt-0.5 font-medium">
            {settings.windowStart}–{settings.windowEnd}
          </dd>
        </div>
        <div>
          <dt className="text-2xs text-subtle-foreground uppercase">Timezone</dt>
          <dd className="mt-0.5 truncate font-medium">{settings.timezone}</dd>
        </div>
        <div>
          <dt className="text-2xs text-subtle-foreground uppercase">Daily limit</dt>
          <dd className="mt-0.5 font-medium">{settings.dailyApplicationLimit}</dd>
        </div>
      </dl>
    </SectionCard>
  );
}
