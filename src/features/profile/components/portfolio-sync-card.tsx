"use client";

import { useTransition } from "react";
import { CircleAlert, Globe, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { syncFromPortfolioAction } from "../server/actions";

interface PortfolioSyncCardProps {
  config: { state: "ready" } | { state: "missing" } | { state: "invalid"; message: string };
  lastSyncedLabel: string | null;
}

export function PortfolioSyncCard({ config, lastSyncedLabel }: PortfolioSyncCardProps) {
  const configured = config.state === "ready";
  const [pending, startTransition] = useTransition();

  const sync = () =>
    startTransition(async () => {
      const result = await syncFromPortfolioAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const parts = Object.entries(result.data.updated)
        .filter(([, n]) => n > 0)
        .map(([section, n]) => `${n} ${section}`);
      toast.success(parts.length ? `Synced from portfolio: ${parts.join(", ")}.` : "Synced from portfolio. Everything was up to date.");
      if (result.data.skipped.length) toast.info(`Not imported: ${result.data.skipped.join("; ")}`);
    });

  return (
    <SectionCard
      title="Portfolio sync"
      icon={Globe}
      description="Pull your profile, links, experience, education, skills and published projects from your portfolio (read-only)."
      action={
        configured ? (
          <Button variant="outline" size="sm" onClick={sync} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            {pending ? "Syncing…" : "Sync from portfolio"}
          </Button>
        ) : null
      }
    >
      {configured ? (
        <p className="text-xs text-muted-foreground">
          Last synced: <span className="font-medium text-foreground">{lastSyncedLabel ?? "Never"}</span>. Synced items
          show a Portfolio badge; matching items you already had are linked, not duplicated.
        </p>
      ) : config.state === "invalid" ? (
        <p role="alert" className="flex gap-2 rounded-lg bg-destructive-soft px-3 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {config.message}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Not connected. Apply the <code className="font-mono">jobpilot_reader</code> migration in your portfolio
          database, enable its login, and set <code className="font-mono">PORTFOLIO_DATABASE_URL</code> on the server.
          See docs/deployment/environment-variables.md.
        </p>
      )}
    </SectionCard>
  );
}
