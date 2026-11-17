"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { evaluateJobAction, evaluateJobInBatchAction, listUnevaluatedJobsAction } from "../server/actions";
import { QUALIFICATION_LABELS } from "./score-badge";

export function EvaluateJobButton({ jobId, evaluated }: { jobId: string; evaluated: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      const result = await evaluateJobAction({ jobId, force: evaluated });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { score, qualification, cached } = result.data;
      toast.success(
        cached ? `Nothing changed since the last score (${score}).` : `Scored ${score}/100 · ${QUALIFICATION_LABELS[qualification]}.`,
      );
    });

  return (
    <Button variant={evaluated ? "outline" : "default"} size="sm" onClick={run} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
      {pending ? "Scoring…" : evaluated ? "Re-score" : "Score match"}
    </Button>
  );
}

/**
 * Scores unscored jobs one request at a time from the browser, so no single request
 * runs long. Stops on the first error (e.g. quota) and can be cancelled.
 */
export function BatchEvaluateButton({ unscored }: { unscored: number }) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const cancelRef = useRef(false);

  const run = async () => {
    cancelRef.current = false;
    setCancelled(false);
    const list = await listUnevaluatedJobsAction();
    if (!list.ok) {
      toast.error(list.error);
      return;
    }
    const { ids } = list.data;
    if (ids.length === 0) {
      toast.info("Every job is already scored.");
      return;
    }
    setProgress({ done: 0, total: ids.length });
    let scored = 0;
    for (const [index, jobId] of ids.entries()) {
      if (cancelRef.current) break;
      const result = await evaluateJobInBatchAction({ jobId, force: false });
      if (!result.ok) {
        toast.error(`Stopped after ${scored} job${scored === 1 ? "" : "s"}: ${result.error}`);
        break;
      }
      scored += 1;
      setProgress({ done: index + 1, total: ids.length });
    }
    if (scored > 0) toast.success(`Scored ${scored} job${scored === 1 ? "" : "s"}.`);
    setProgress(null);
    router.refresh();
  };

  if (progress) {
    return (
      <Button
        variant="outline"
        onClick={() => {
          cancelRef.current = true;
          setCancelled(true);
        }}
        disabled={cancelled}
      >
        {cancelled ? <Loader2 className="animate-spin" aria-hidden /> : <Square aria-hidden />}
        Scoring {progress.done}/{progress.total}… {cancelled ? "stopping" : "Stop"}
      </Button>
    );
  }

  return (
    <Button variant="outline" onClick={run} disabled={unscored === 0}>
      <Sparkles aria-hidden /> Score {unscored > 25 ? "25 newest" : unscored} unscored
    </Button>
  );
}
