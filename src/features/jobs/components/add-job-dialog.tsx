"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { FormDialog } from "@/components/shared/form-dialog";
import { FormActions, NumberField, SelectField, TextareaField, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { EMPLOYMENT_TYPE_OPTIONS, SALARY_PERIOD_OPTIONS } from "@/features/profile/components/options";
import { REMOTE_TYPE_LABELS } from "@/config/labels";
import { addManualJobAction, prefillJobAction } from "../server/actions";
import { manualJobSchema, type ManualJobInput } from "../schemas";

const EMPTY: ManualJobInput = {
  url: "",
  title: "",
  company: "",
  location: "",
  remoteType: "unknown",
  employmentType: "",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: "",
  salaryPeriod: "",
  description: "",
};

const REMOTE_OPTIONS = Object.entries(REMOTE_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export function AddJobDialog({ trigger }: { trigger: ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title="Add a job"
      description="Paste the posting URL. For LinkedIn, Indeed and JobStreet, copy the details in yourself — those sites do not allow automated access."
    >
      {(close) => <AddJobForm onDone={close} />}
    </FormDialog>
  );
}

function AddJobForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [prefilling, startPrefill] = useTransition();
  const { form, onSubmit, pending } = useActionForm({
    schema: manualJobSchema,
    defaultValues: EMPTY,
    submit: async (values) => {
      const result = await addManualJobAction(values);
      if (result.ok) router.push(`/jobs/${result.data.jobId}`);
      return result;
    },
    successMessage: "Job added.",
    onSuccess: onDone,
  });

  const prefill = () =>
    startPrefill(async () => {
      const url = form.getValues("url");
      const result = await prefillJobAction({ url });
      if (!result.ok) {
        toast.error(result.fieldErrors?.url?.[0] ?? result.error);
        return;
      }
      const draft = result.data;
      // keepDefaultValues: the prefilled form still counts as edited (dirty).
      form.reset(
        {
          ...form.getValues(),
          title: draft.title,
          company: draft.company,
          location: draft.location ?? "",
          remoteType: draft.remoteType,
          employmentType: draft.employmentType ?? "",
          salaryMin: draft.salaryMin,
          salaryMax: draft.salaryMax,
          salaryCurrency: draft.salaryCurrency ?? "",
          salaryPeriod: draft.salaryPeriod ?? "",
          description: draft.description ?? "",
        },
        { keepDefaultValues: true },
      );
      toast.success("Details filled in from the page. Review them before saving.");
    });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="flex items-end gap-2">
          <TextField form={form} name="url" label="Job URL" type="url" placeholder="https://" className="flex-1" />
          <Button type="button" variant="outline" onClick={prefill} disabled={prefilling} className="mb-px">
            {prefilling ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />}
            Fill from page
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="title" label="Job title" />
          <TextField form={form} name="company" label="Company" />
          <TextField form={form} name="location" label="Location" />
          <SelectField form={form} name="remoteType" label="Work arrangement" options={REMOTE_OPTIONS} />
          <SelectField form={form} name="employmentType" label="Employment type" placeholder="Not specified" options={EMPLOYMENT_TYPE_OPTIONS} />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <NumberField form={form} name="salaryMin" label="Salary from" step={1000} />
          <NumberField form={form} name="salaryMax" label="Salary to" step={1000} />
          <TextField form={form} name="salaryCurrency" label="Currency" placeholder="USD" />
          <SelectField form={form} name="salaryPeriod" label="Period" placeholder="—" options={SALARY_PERIOD_OPTIONS} />
        </div>
        <TextareaField form={form} name="description" label="Description" rows={8} placeholder="Paste the full job description." />
        <FormActions pending={pending} onCancel={onDone} submitLabel="Add job" />
      </FieldGroup>
    </form>
  );
}
