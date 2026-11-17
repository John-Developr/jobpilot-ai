"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { CheckboxField, FormActions, ListField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { JOB_SOURCE_CATALOG, type AutomatedConnectorKey } from "@/lib/integrations/job-sources/catalog";
import { saveSourceAction, syncSourceAction } from "../server/actions";
import { saveSourceSchema, type SaveSourceInput } from "../schemas";
import type { SourceState } from "../server/source-repository";

interface SourceCardProps {
  source: SourceState & { key: AutomatedConnectorKey };
  lastSyncedLabel: string | null;
}

export function SourceSettingsForm({ source }: { source: SourceCardProps["source"] }) {
  const entry = JOB_SOURCE_CATALOG[source.key];
  const usesCompanies = entry.configKind === "companies";
  const { form, onSubmit, pending } = useActionForm({
    schema: saveSourceSchema,
    defaultValues: {
      key: source.key,
      isEnabled: source.id ? source.isEnabled : true,
      config: usesCompanies
        ? { companies: source.config.companies, keywords: source.config.keywords }
        : { keywords: source.config.keywords },
    } satisfies SaveSourceInput,
    submit: saveSourceAction,
    successMessage: `${entry.name} saved.`,
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        {usesCompanies ? (
          <ListField
            form={form}
            name="config.companies"
            label="Company boards"
            separator="comma"
            rows={2}
            placeholder="gitlab, canva"
            description={"boardHint" in entry ? entry.boardHint : undefined}
          />
        ) : null}
        <ListField
          form={form}
          name="config.keywords"
          label={usesCompanies ? "Title keywords (optional)" : "Title keywords"}
          separator="comma"
          rows={2}
          placeholder="iOS, Swift, React Native, Shopify"
          description={
            usesCompanies
              ? "Only keep jobs whose title matches one of these. Leave empty to keep every job."
              : "Required. Only jobs whose title or tags match one of these are imported."
          }
        />
        <CheckboxField form={form} name="isEnabled" label="Enabled" />
        <FormActions pending={pending} disabled={!form.formState.isDirty} submitLabel="Save settings" />
      </FieldGroup>
    </form>
  );
}

export function SyncSourceButton({ sourceKey, disabled }: { sourceKey: AutomatedConnectorKey; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const sync = () =>
    startTransition(async () => {
      const result = await syncSourceAction({ key: sourceKey });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { inserted, matched, fetched, warnings } = result.data;
      toast.success(
        `${inserted} new job${inserted === 1 ? "" : "s"} · ${matched} matched of ${fetched} fetched${
          matched - inserted > 0 ? ` · ${matched - inserted} already saved` : ""
        }`,
      );
      if (warnings.length) toast.warning(warnings.join(" "));
    });

  return (
    <Button variant="outline" size="sm" onClick={sync} disabled={pending || disabled}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      {pending ? "Syncing…" : "Sync now"}
    </Button>
  );
}
