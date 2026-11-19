import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/features/jobs/components/job-badges";
import { ScoreBadge } from "@/features/evaluation/components/score-badge";
import type { QueueTone } from "../labels";
import type { QueueItem } from "../server/application-repository";

const TONE_CLASS: Record<QueueTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  destructive: "bg-destructive-soft text-destructive",
  muted: "bg-muted text-muted-foreground",
};

export function QueueStateBadge({ label, tone }: { label: string; tone: QueueTone }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold", TONE_CLASS[tone])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

interface QueueRowProps {
  item: QueueItem;
  /** Extra line under the title (schedule, error, submission time). */
  detail?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}

/** One application in a queue list: job, score/status, detail and its actions. */
export function QueueRow({ item, detail, badge, actions }: QueueRowProps) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:gap-4">
      <div className="min-w-0 flex-1">
        <Link
          href={`/application-studio/${item.applicationId}`}
          className="block truncate text-sm font-semibold hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {item.title}
        </Link>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{item.company}</span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-0.5 text-brand-text hover:underline"
          >
            Job posting <ExternalLink className="size-3" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </p>
        {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {item.score !== null && item.qualification ? <ScoreBadge score={item.score} qualification={item.qualification} /> : null}
        {badge ?? <StatusBadge status={item.status} />}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </li>
  );
}
