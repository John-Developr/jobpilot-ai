"use client";

import type { ReactNode } from "react";
import { FieldGroup } from "@/components/ui/field";
import { FormDialog } from "@/components/shared/form-dialog";
import { FormActions, ListField, TextareaField, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { PORTFOLIO_EDIT_NOTE } from "./portfolio-badge";
import { createProjectAction, updateProjectAction } from "../server/actions";
import { projectSchema, type ProjectInput } from "../schemas";
import type { Project } from "../server/career-repository";

const EMPTY: ProjectInput = {
  name: "",
  role: "",
  description: "",
  url: "",
  repositoryUrl: "",
  technologies: [],
  highlights: [],
  startMonth: "",
  endMonth: "",
};

export function ProjectDialog({ project, trigger }: { project?: Project; trigger: ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title={project ? "Edit project" : "Add project"}
      description={project?.fromPortfolio ? PORTFOLIO_EDIT_NOTE : undefined}
    >
      {(close) => <ProjectForm project={project} onDone={close} />}
    </FormDialog>
  );
}

function ProjectForm({ project, onDone }: { project?: Project; onDone: () => void }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: projectSchema,
    defaultValues: project ? withoutId(project) : EMPTY,
    submit: (values) => (project ? updateProjectAction({ id: project.id, values }) : createProjectAction(values)),
    onSuccess: onDone,
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="name" label="Project name" />
          <TextField form={form} name="role" label="Your role" />
          <TextField form={form} name="url" label="Live URL" type="url" placeholder="https://" />
          <TextField form={form} name="repositoryUrl" label="Repository URL" type="url" placeholder="https://" />
          <TextField form={form} name="startMonth" label="Start" type="month" />
          <TextField form={form} name="endMonth" label="End" type="month" />
        </div>
        <TextareaField form={form} name="description" label="Description" rows={4} />
        <ListField form={form} name="highlights" label="Highlights" separator="line" description="One per line." />
        <ListField
          form={form}
          name="technologies"
          label="Technologies"
          separator="comma"
          placeholder="Next.js, Supabase, TypeScript"
          description="Comma-separated."
        />
        <FormActions pending={pending} onCancel={onDone} />
      </FieldGroup>
    </form>
  );
}

function withoutId({ id, fromPortfolio, ...values }: Project): ProjectInput {
  return values;
}
