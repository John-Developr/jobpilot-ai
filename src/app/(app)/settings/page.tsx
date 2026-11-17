import type { Metadata } from "next";
import { CalendarClock, Scale, ShieldCheck } from "lucide-react";
import { ScoringWeightsForm } from "@/features/settings/components/scoring-weights-form";
import { requireUser } from "@/server/auth";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { AutomationScheduleForm } from "@/features/settings/components/automation-schedule-form";
import { EmergencyPauseButton } from "@/features/settings/components/emergency-pause-button";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireUser();
  const settings = await getAutomationSettings(ctx);
  const supported = Intl.supportedValuesOf("timeZone");
  const timezones = supported.includes(settings.timezone) ? supported : [settings.timezone, ...supported];

  return (
    <>
      <PageHeader title="Settings" description="Control when and how JobPilot submits applications." />
      <div className="flex flex-col gap-5">
        <SectionCard
          title="Submission schedule"
          icon={CalendarClock}
          description="Applies only to the final submit step. Every submission is re-checked against this schedule on the server immediately before it happens."
        >
          <AutomationScheduleForm
            timezones={timezones}
            defaultValues={{
              isEnabled: settings.isEnabled,
              timezone: settings.timezone,
              workingDays: [...settings.workingDays],
              windowStart: settings.windowStart,
              windowEnd: settings.windowEnd,
              dailyApplicationLimit: settings.dailyApplicationLimit,
              minMatchScore: settings.minMatchScore,
              maxRetries: settings.maxRetries,
              retryBackoffMinutes: settings.retryBackoffMinutes,
            }}
          />
        </SectionCard>

        <SectionCard
          title="Match scoring"
          icon={Scale}
          description="How much each criterion counts in a job's 0–100 match. 85+ is high priority, 70–84 recommended, 55–69 manual review, below 55 archived (always with the reasons shown)."
        >
          <ScoringWeightsForm defaultValues={settings.scoringWeights} />
        </SectionCard>

        <SectionCard
          title="Safety"
          icon={ShieldCheck}
          description="Guards that apply regardless of the schedule."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Emergency pause</p>
                <p className="text-xs text-muted-foreground">
                  {settings.isPaused
                    ? `Paused${settings.pausedReason ? ` — ${settings.pausedReason}` : ""}. Nothing is submitted until you resume.`
                    : "Immediately blocks every queued and in-progress submission."}
                </p>
              </div>
              <EmergencyPauseButton isPaused={settings.isPaused} />
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium">Human approval</p>
              <p className="text-xs text-muted-foreground">
                Required for every application. You approve each one before its final submission;
                this cannot be turned off in the current release.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
