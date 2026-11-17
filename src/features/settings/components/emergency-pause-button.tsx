"use client";

import { useTransition } from "react";
import { CirclePause, CirclePlay, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setEmergencyPauseAction } from "../server/actions";

interface EmergencyPauseButtonProps {
  isPaused: boolean;
}

/** Pausing takes effect immediately for every queued and in-flight submission. */
export function EmergencyPauseButton({ isPaused }: EmergencyPauseButtonProps) {
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      const result = await setEmergencyPauseAction(
        isPaused ? { paused: false } : { paused: true, reason: "Paused from the app" },
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.data.paused ? "All submissions paused." : "Submissions resumed.");
    });
  };

  return isPaused ? (
    <Button variant="outline" onClick={toggle} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CirclePlay aria-hidden />}
      Resume submissions
    </Button>
  ) : (
    <Button variant="destructive" onClick={toggle} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CirclePause aria-hidden />}
      Emergency pause
    </Button>
  );
}
