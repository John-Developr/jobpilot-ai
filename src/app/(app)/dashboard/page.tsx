import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { PageHeader } from "@/components/shared/page-header";
import { AutomationStatusCard } from "@/features/dashboard/components/automation-status-card";
import { PipelineCard } from "@/features/dashboard/components/pipeline-card";
import { ProfileReadinessCard } from "@/features/dashboard/components/profile-readiness-card";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";
import { getProfileCompleteness } from "@/features/profile/server/profile-repository";
import { getJobStats } from "@/features/jobs/server/job-repository";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireUser();
  const now = new Date();
  const [settings, completeness, jobStats] = await Promise.all([
    getAutomationSettings(ctx),
    getProfileCompleteness(ctx),
    getJobStats(ctx, now),
  ]);

  return (
    <>
      <PageHeader title="Dashboard" description="Your job search pipeline at a glance." />
      <div className="flex flex-col gap-5">
        <AutomationStatusCard settings={settings} now={now} />
        <PipelineCard stats={jobStats} />
        <ProfileReadinessCard completeness={completeness} />
      </div>
    </>
  );
}
