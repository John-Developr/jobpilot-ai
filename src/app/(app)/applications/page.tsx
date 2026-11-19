import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, History, Info, ListChecks, Send, ShieldCheck } from "lucide-react";
import { requireUser } from "@/server/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { localDayBounds } from "@/lib/scheduling/submission-window";
import { StatusBadge } from "@/features/jobs/components/job-badges";
import { formatDateTime } from "@/features/jobs/format";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";
import { MarkAppliedButton, ApproveButton, WithdrawApprovalButton } from "@/features/applications/components/queue-actions";
import { QueueRow, QueueStateBadge } from "@/features/applications/components/queue-item";
import { eventLabel, queueStateLabel } from "@/features/applications/labels";
import { queueState } from "@/features/applications/queue";
import {
  countSubmitted,
  listQueue,
  listRecentEvents,
  listRecentlyApplied,
} from "@/features/applications/server/application-repository";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const ctx = await requireUser();
  const now = new Date();
  const settings = await getAutomationSettings(ctx);
  const [queue, applied, events, submittedToday] = await Promise.all([
    listQueue(ctx),
    listRecentlyApplied(ctx),
    listRecentEvents(ctx),
    countSubmitted(ctx, localDayBounds(now, settings.timezone)),
  ]);

  const at = (iso: string | null) => formatDateTime(iso, settings.timezone);
  const pending = queue.filter((item) => item.status === "pending_approval");
  const queued = queue.filter((item) => ["approved", "scheduled", "applying"].includes(item.status));
  const failed = queue.filter((item) => item.status === "failed");

  return (
    <>
      <PageHeader
        title="Applications"
        description="Approve prepared applications, follow the submission queue and record what you sent."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">Submission schedule</Link>
          </Button>
        }
      />

      <Alert className="mb-5">
        <Info aria-hidden />
        <AlertTitle>Automated submission is not available yet</AlertTitle>
        <AlertDescription>
          Approved applications are queued by priority and your submission window, but JobPilot does not send them yet.
          Submit each one yourself from its job posting, then mark it as applied.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-5">
        <SectionCard
          title="Waiting for approval"
          icon={ShieldCheck}
          description="Nothing joins the queue without your approval."
        >
          {pending.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Nothing to approve"
              description="Prepare documents in Application Studio and mark them ready for approval."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/application-studio">Open Application Studio</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {pending.map((item) => (
                <QueueRow
                  key={item.applicationId}
                  item={item}
                  actions={
                    <>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/application-studio/${item.applicationId}`}>Review</Link>
                      </Button>
                      <ApproveButton applicationId={item.applicationId} />
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Queue"
          icon={ListChecks}
          description={`In submission order: priority, then age. Today: ${submittedToday} of ${settings.dailyApplicationLimit} submissions.`}
        >
          {queued.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="The queue is empty"
              description="Approved applications appear here until they are submitted."
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {queued.map((item) => {
                const state =
                  item.status === "applying"
                    ? null
                    : queueStateLabel(
                        queueState({
                          now,
                          settings,
                          scheduledFor: item.scheduledFor ? new Date(item.scheduledFor) : null,
                          submittedToday,
                        }),
                        (instant) => at(instant.toISOString()) ?? "",
                      );
                return (
                  <QueueRow
                    key={item.applicationId}
                    item={item}
                    detail={item.approvedAt ? `Approved ${at(item.approvedAt)}` : null}
                    badge={state ? <QueueStateBadge {...state} /> : undefined}
                    actions={
                      item.status === "applying" ? null : (
                        <>
                          <WithdrawApprovalButton applicationId={item.applicationId} />
                          <MarkAppliedButton applicationId={item.applicationId} />
                        </>
                      )
                    }
                  />
                );
              })}
            </ul>
          )}
        </SectionCard>

        {failed.length > 0 ? (
          <SectionCard
            title="Needs attention"
            icon={CircleAlert}
            description="Submission stopped. Check the job site before approving again: a stopped run may already have submitted."
          >
            <ul className="divide-y rounded-lg border">
              {failed.map((item) => (
                <QueueRow
                  key={item.applicationId}
                  item={item}
                  detail={
                    <>
                      {item.lastError ?? "No error recorded."} · {item.attemptCount} attempt{item.attemptCount === 1 ? "" : "s"}
                    </>
                  }
                  actions={
                    <>
                      <WithdrawApprovalButton applicationId={item.applicationId} />
                      <MarkAppliedButton applicationId={item.applicationId} />
                      <ApproveButton applicationId={item.applicationId} retry />
                    </>
                  }
                />
              ))}
            </ul>
          </SectionCard>
        ) : null}

        <SectionCard title="Recently applied" icon={Send}>
          {applied.length === 0 ? (
            <EmptyState icon={Send} title="No applications sent yet" description="Applications you mark as applied appear here." />
          ) : (
            <ul className="divide-y rounded-lg border">
              {applied.map((item) => (
                <QueueRow
                  key={item.applicationId}
                  item={item}
                  detail={`${item.submissionMethod === "automation" ? "Submitted automatically" : "Submitted by you"} · ${at(item.submittedAt) ?? "date unknown"}`}
                />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Activity" icon={History} description="Every status change is recorded.">
          {events.length === 0 ? (
            <EmptyState icon={History} title="No activity yet" description="Scoring, drafting, approvals and submissions are logged here." />
          ) : (
            <ol className="divide-y rounded-lg border">
              {events.map((event) => (
                <li key={event.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-28 shrink-0 text-xs text-subtle-foreground tabular-nums">{at(event.createdAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{eventLabel(event.eventType)}</span>
                    {event.title ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {event.title}
                        {event.company ? `, ${event.company}` : ""}
                      </span>
                    ) : null}
                    {event.message ? <span className="block text-xs text-muted-foreground">{event.message}</span> : null}
                  </span>
                  {event.toStatus ? <StatusBadge status={event.toStatus} /> : null}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
    </>
  );
}
