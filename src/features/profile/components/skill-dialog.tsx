"use client";

import type { ReactNode } from "react";
import { FieldGroup } from "@/components/ui/field";
import { FormDialog } from "@/components/shared/form-dialog";
import {
  CheckboxField,
  FormActions,
  ListField,
  NumberField,
  SelectField,
  TextField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { bulkCreateSkillsAction, createSkillAction, updateSkillAction } from "../server/actions";
import { bulkSkillsSchema, skillSchema, type BulkSkillsInput, type SkillInput } from "../schemas";
import type { Skill } from "../server/career-repository";
import { PROFICIENCY_OPTIONS, SKILL_CATEGORY_OPTIONS } from "./options";

const EMPTY: SkillInput = {
  name: "",
  category: "framework",
  proficiency: null,
  yearsOfExperience: null,
  isPrimary: false,
};

export function SkillDialog({ skill, trigger }: { skill?: Skill; trigger: ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title={skill ? "Edit skill" : "Add skill"}
      description={skill?.fromPortfolio ? "Synced from your portfolio. Proficiency, years and primary flag are JobPilot-only and kept on every sync." : undefined}
    >
      {(close) => <SkillForm skill={skill} onDone={close} />}
    </FormDialog>
  );
}

function SkillForm({ skill, onDone }: { skill?: Skill; onDone: () => void }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: skillSchema,
    defaultValues: skill
      ? {
          name: skill.name,
          category: skill.category,
          proficiency: skill.proficiency,
          yearsOfExperience: skill.yearsOfExperience,
          isPrimary: skill.isPrimary,
        }
      : EMPTY,
    submit: (values) => (skill ? updateSkillAction({ id: skill.id, values }) : createSkillAction(values)),
    onSuccess: onDone,
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="name" label="Skill" placeholder="e.g. SwiftUI" />
          <SelectField form={form} name="category" label="Category" options={SKILL_CATEGORY_OPTIONS} />
          <SelectField
            form={form}
            name="proficiency"
            label="Proficiency"
            placeholder="Not rated"
            options={PROFICIENCY_OPTIONS}
            nullableNumber
          />
          <NumberField form={form} name="yearsOfExperience" label="Years used" step={0.5} />
        </div>
        <CheckboxField
          form={form}
          name="isPrimary"
          label="Primary skill"
          description="Core skills weigh more when matching jobs."
        />
        <FormActions pending={pending} onCancel={onDone} />
      </FieldGroup>
    </form>
  );
}

export function BulkSkillsDialog({ trigger }: { trigger: ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title="Add several skills"
      description="Paste a comma-separated list. Skills you already have are skipped."
    >
      {(close) => <BulkSkillsForm onDone={close} />}
    </FormDialog>
  );
}

function BulkSkillsForm({ onDone }: { onDone: () => void }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: bulkSkillsSchema,
    defaultValues: { names: [], category: "framework" } satisfies BulkSkillsInput,
    submit: bulkCreateSkillsAction,
    successMessage: "Skills added.",
    onSuccess: onDone,
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <ListField
          form={form}
          name="names"
          label="Skills"
          separator="comma"
          rows={3}
          placeholder="Swift, SwiftUI, UIKit, Objective-C"
        />
        <SelectField form={form} name="category" label="Category for all" options={SKILL_CATEGORY_OPTIONS} />
        <FormActions pending={pending} onCancel={onDone} submitLabel="Add skills" />
      </FieldGroup>
    </form>
  );
}
