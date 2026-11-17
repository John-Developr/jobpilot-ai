import { Gauge } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { CRITERIA, CRITERION_LABELS } from "../scoring";
import type { JobEvaluation } from "../server/evaluation-repository";
import { EvaluateJobButton } from "./evaluate-buttons";
import { ScoreBadge } from "./score-badge";

function Chips({ items, tone }: { items: string[]; tone: "success" | "destructive" | "muted" }) {
  if (items.length === 0) return <p className="text-xs text-subtle-foreground">None</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "rounded-md px-1.5 py-0.5 text-2xs font-medium",
            tone === "success" && "bg-success-soft text-success",
            tone === "destructive" && "bg-destructive-soft text-destructive",
            tone === "muted" && "border text-muted-foreground",
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-xs text-subtle-foreground">None</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

interface MatchCardProps {
  jobId: string;
  evaluation: JobEvaluation | null;
  aiReady: boolean;
  evaluatedLabel: string | null;
}

/** Explains every score: criteria with weights and reasoning, skills, factors and provenance. */
export function MatchCard({ jobId, evaluation, aiReady, evaluatedLabel }: MatchCardProps) {
  const action = aiReady ? <EvaluateJobButton jobId={jobId} evaluated={evaluation !== null} /> : null;

  if (!evaluation) {
    return (
      <SectionCard title="Match" icon={Gauge} action={action}>
        <EmptyState
          icon={Gauge}
          title="Not scored yet"
          description={
            aiReady
              ? "Score this job against your verified profile. You get a 0–100 match with the reasons behind it."
              : "AI scoring needs GEMINI_API_KEY (or OPENAI_API_KEY) in the server environment."
          }
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Match" icon={Gauge} action={action}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <ScoreBadge score={evaluation.overallScore} qualification={evaluation.qualification} size="lg" />
        </div>
        <p className="text-prose">{evaluation.explanation}</p>

        {evaluation.criteria ? (
          <ul className="grid gap-3">
            {CRITERIA.map((criterion) => {
              const item = evaluation.criteria?.[criterion];
              if (!item) return null;
              return (
                <li key={criterion}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{CRITERION_LABELS[criterion]}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {item.score}/100 · weight {evaluation.weights[criterion] ?? 0}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                    role="meter"
                    aria-label={CRITERION_LABELS[criterion]}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.score}
                  >
                    <div className="h-full rounded-full bg-brand" style={{ width: `${item.score}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.reasoning}</p>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-2xs font-semibold tracking-wider text-subtle-foreground uppercase">Matched skills</h3>
            <Chips items={evaluation.matchedSkills} tone="success" />
          </div>
          <div>
            <h3 className="mb-2 text-2xs font-semibold tracking-wider text-subtle-foreground uppercase">Missing skills</h3>
            <Chips items={evaluation.missingSkills} tone="destructive" />
          </div>
          <div>
            <h3 className="mb-2 text-2xs font-semibold tracking-wider text-subtle-foreground uppercase">In your favor</h3>
            <Bullets items={evaluation.positiveFactors} />
          </div>
          <div>
            <h3 className="mb-2 text-2xs font-semibold tracking-wider text-subtle-foreground uppercase">Concerns</h3>
            <Bullets items={[...evaluation.negativeFactors, ...evaluation.experienceGaps]} />
          </div>
        </div>

        {evaluation.requirements.length > 0 ? (
          <div className="border-t pt-4">
            <h3 className="mb-2 text-2xs font-semibold tracking-wider text-subtle-foreground uppercase">Requirements found</h3>
            <Chips
              items={evaluation.requirements.map(
                (r) => `${r.description}${r.minYears ? ` (${r.minYears}+ yrs)` : ""}${r.isRequired ? "" : " · nice to have"}`,
              )}
              tone="muted"
            />
          </div>
        ) : null}

        <p className="border-t pt-3 text-2xs text-subtle-foreground">
          Scored {evaluatedLabel} · {evaluation.model}
          {evaluation.promptVersion ? ` · prompt v${evaluation.promptVersion}` : ""}. Skill matches are limited to your
          verified profile. Remote, salary and employment type are computed from your preferences, not by the AI.
        </p>
      </div>
    </SectionCard>
  );
}
