"use client";

import type { ReactNode } from "react";
import { FieldGroup } from "@/components/ui/field";
import { FormDialog } from "@/components/shared/form-dialog";
import { FormActions, ListField, TextareaField, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { createResumeAction, updateResumeAction } from "../server/actions";
import { resumeSchema, type ResumeInput } from "../schemas";
import type { Resume } from "../server/resume-repository";

const EMPTY: ResumeInput = { name: "", targetCategory: "", summary: "", emphasizedSkills: [] };

export function ResumeDialog({ resume, trigger }: { resume?: Resume; trigger: ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title={resume ? "Edit resume" : "New resume version"}
      description="A version targets one kind of role, e.g. iOS, full-stack or e-commerce."
    >
      {(close) => <ResumeForm resume={resume} onDone={close} />}
    </FormDialog>
  );
}

function ResumeForm({ resume, onDone }: { resume?: Resume; onDone: () => void }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: resumeSchema,
    defaultValues: resume
      ? {
          name: resume.name,
          targetCategory: resume.targetCategory,
          summary: resume.summary,
          emphasizedSkills: resume.emphasizedSkills,
        }
      : EMPTY,
    submit: (values) => (resume ? updateResumeAction({ id: resume.id, values }) : createResumeAction(values)),
    onSuccess: onDone,
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="name" label="Name" placeholder="e.g. iOS Engineer 2026" />
          <TextField form={form} name="targetCategory" label="Target role category" placeholder="e.g. iOS Development" />
        </div>
        <TextareaField
          form={form}
          name="summary"
          label="Summary"
          rows={5}
          description="The summary this version leads with. Stick to facts from your profile."
        />
        <ListField
          form={form}
          name="emphasizedSkills"
          label="Skills to emphasize"
          separator="comma"
          placeholder="Swift, SwiftUI, UIKit"
        />
        <FormActions pending={pending} onCancel={onDone} />
      </FieldGroup>
    </form>
  );
}
