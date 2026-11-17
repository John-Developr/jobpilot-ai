"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  description = "The page could not be loaded. Try again, and check the logs if it keeps failing.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-xl bg-card px-6 py-12 text-center shadow-card"
    >
      <span className="mb-3 flex size-10 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
        <CircleAlert className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RotateCcw aria-hidden /> Try again
        </Button>
      ) : null}
    </div>
  );
}
