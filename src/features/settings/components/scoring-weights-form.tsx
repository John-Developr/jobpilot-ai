"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { FormActions, NumberField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { CRITERIA, CRITERION_LABELS, DEFAULT_WEIGHTS, weightsSchema, type Weights } from "@/features/evaluation/scoring";
import { updateScoringWeightsAction } from "../server/actions";

export function ScoringWeightsForm({ defaultValues }: { defaultValues: Weights }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: weightsSchema,
    defaultValues,
    submit: updateScoringWeightsAction,
    successMessage: "Scoring weights saved. Re-score jobs to apply them.",
  });
  const values = form.watch();
  const total = CRITERIA.reduce((sum, c) => sum + (Number.isFinite(values[c]) ? values[c] : 0), 0);

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-3">
          {CRITERIA.map((criterion) => (
            <NumberField key={criterion} form={form} name={criterion} label={CRITERION_LABELS[criterion]} step={1} />
          ))}
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Total <span className="font-semibold text-foreground tabular-nums">{total}</span>. Weights are relative — they
          don&apos;t need to add up to 100. The match score is the weighted average of the six criteria.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => form.reset(DEFAULT_WEIGHTS, { keepDefaultValues: true })}
          >
            <RotateCcw aria-hidden /> Defaults (30/20/20/15/10/5)
          </Button>
          <FormActions pending={pending} disabled={!form.formState.isDirty} submitLabel="Save weights" />
        </div>
      </FieldGroup>
    </form>
  );
}
