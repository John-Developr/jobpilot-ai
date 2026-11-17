"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server errors are logged on the server; this surfaces the digest for correlation.
    console.error("app.render_failed", { digest: error.digest });
  }, [error]);

  return <ErrorState onRetry={reset} />;
}
