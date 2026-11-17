"use client";

import { FieldGroup } from "@/components/ui/field";
import { FormActions, NumberField, TextareaField, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { updatePersonalInfoAction } from "../server/actions";
import { personalInfoSchema, type PersonalInfoInput } from "../schemas";

export function PersonalInfoForm({ defaultValues, email }: { defaultValues: PersonalInfoInput; email: string }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: personalInfoSchema,
    defaultValues,
    submit: updatePersonalInfoAction,
    successMessage: "Profile saved.",
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="fullName" label="Full name" autoComplete="name" />
          <TextField
            form={form}
            name="headline"
            label="Headline"
            placeholder="e.g. Full-Stack & iOS Developer"
          />
          <div className="grid gap-2">
            <p className="text-sm font-medium">Email</p>
            <p className="flex h-8 items-center truncate rounded-lg border bg-muted px-2.5 text-sm text-muted-foreground">
              {email || "—"}
            </p>
            <p className="text-xs text-muted-foreground">Your sign-in email. Change it in Supabase Auth.</p>
          </div>
          <TextField form={form} name="phone" label="Phone" type="tel" autoComplete="tel" />
          <TextField form={form} name="location" label="Location" placeholder="e.g. Cebu City, Philippines" />
          <NumberField form={form} name="yearsOfExperience" label="Years of experience" step={0.5} />
        </div>
        <TextareaField
          form={form}
          name="summary"
          label="Professional summary"
          rows={6}
          description="Used as the factual basis for tailored resume summaries. Keep it accurate."
        />
        <FormActions pending={pending} disabled={!form.formState.isDirty} submitLabel="Save profile" />
      </FieldGroup>
    </form>
  );
}
