"use client";

import type { ReactNode } from "react";
import { FieldGroup } from "@/components/ui/field";
import { FormDialog } from "@/components/shared/form-dialog";
import {
  CheckboxField,
  FormActions,
  ListField,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { PORTFOLIO_EDIT_NOTE } from "./portfolio-badge";
import { createExperienceAction, updateExperienceAction } from "../server/actions";
import { experienceSchema, type ExperienceInput } from "../schemas";
import type { Experience } from "../server/career-repository";
import { EMPLOYMENT_TYPE_OPTIONS, REMOTE_TYPE_OPTIONS } from "./options";

const EMPTY: ExperienceInput = {
  company: "",
  title: "",
  location: "",
  employmentType: "",
  remoteType: "",
  startMonth: "",
  endMonth: "",
  isCurrent: false,
  description: "",
  achievements: [],
  technologies: [],
};

export function ExperienceDialog({ experience, trigger }: { experience?: Experience; trigger: ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title={experience ? "Edit experience" : "Add experience"}
      description={
        experience?.fromPortfolio
          ? PORTFOLIO_EDIT_NOTE
          : "Only include facts you can stand behind — generated documents draw from this."
      }
    >
      {(close) => <ExperienceForm experience={experience} onDone={close} />}
    </FormDialog>
  );
}

function ExperienceForm({ experience, onDone }: { experience?: Experience; onDone: () => void }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: experienceSchema,
    defaultValues: experience ? withoutId(experience) : EMPTY,
    submit: (values) =>
      experience ? updateExperienceAction({ id: experience.id, values }) : createExperienceAction(values),
    onSuccess: onDone,
  });
  const isCurrent = form.watch("isCurrent");

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="title" label="Job title" />
          <TextField form={form} name="company" label="Company" />
          <TextField form={form} name="location" label="Location" />
          <SelectField form={form} name="employmentType" label="Employment type" placeholder="Not specified" options={EMPLOYMENT_TYPE_OPTIONS} />
          <SelectField form={form} name="remoteType" label="Work arrangement" placeholder="Not specified" options={REMOTE_TYPE_OPTIONS} />
          <div />
          <TextField form={form} name="startMonth" label="Start" type="month" />
          {isCurrent ? <div /> : <TextField form={form} name="endMonth" label="End" type="month" />}
        </div>
        <CheckboxField form={form} name="isCurrent" label="I currently work here" />
        <TextareaField form={form} name="description" label="Description" rows={4} />
        <ListField
          form={form}
          name="achievements"
          label="Achievements"
          separator="line"
          description="One per line. Concrete outcomes only."
        />
        <ListField
          form={form}
          name="technologies"
          label="Technologies"
          separator="comma"
          placeholder="Swift, SwiftUI, Firebase"
          description="Comma-separated."
        />
        <FormActions pending={pending} onCancel={onDone} />
      </FieldGroup>
    </form>
  );
}

function withoutId({ id, fromPortfolio, ...values }: Experience): ExperienceInput {
  return values;
}
