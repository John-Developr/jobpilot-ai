"use client";

import { FieldGroup } from "@/components/ui/field";
import {
  CheckboxField,
  ChipsField,
  FormActions,
  ListField,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { updatePreferencesAction } from "../server/actions";
import { preferencesSchema, type PreferencesInput } from "../schemas";
import { EMPLOYMENT_TYPE_OPTIONS, REMOTE_TYPE_OPTIONS, SALARY_PERIOD_OPTIONS } from "./options";

export function PreferencesForm({ defaultValues }: { defaultValues: PreferencesInput }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: preferencesSchema,
    defaultValues,
    submit: updatePreferencesAction,
    successMessage: "Preferences saved.",
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <ListField
            form={form}
            name="desiredTitles"
            label="Target job titles"
            separator="line"
            placeholder={"Senior iOS Engineer\nFull-Stack Developer"}
            description="One per line."
          />
          <ListField
            form={form}
            name="preferredLocations"
            label="Preferred locations"
            separator="line"
            placeholder={"Remote\nCebu City"}
            description="One per line."
          />
        </div>
        <ChipsField form={form} name="employmentTypes" label="Employment types" options={EMPLOYMENT_TYPE_OPTIONS} />
        <ChipsField form={form} name="acceptedRemoteTypes" label="Work arrangements" options={REMOTE_TYPE_OPTIONS} />
        <CheckboxField form={form} name="willingToRelocate" label="Open to relocation" />
        <div className="grid gap-4 sm:grid-cols-4">
          <NumberField form={form} name="salaryMin" label="Minimum salary" step={1000} />
          <NumberField form={form} name="salaryMax" label="Maximum salary" step={1000} />
          <TextField form={form} name="salaryCurrency" label="Currency" placeholder="PHP" />
          <SelectField form={form} name="salaryPeriod" label="Period" options={SALARY_PERIOD_OPTIONS} />
        </div>
        <TextareaField
          form={form}
          name="notes"
          label="Other preferences"
          rows={3}
          description="Anything the matching engine should consider (industries to avoid, team size, …)."
        />
        <FormActions pending={pending} disabled={!form.formState.isDirty} submitLabel="Save preferences" />
      </FieldGroup>
    </form>
  );
}
