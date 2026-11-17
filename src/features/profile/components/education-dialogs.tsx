"use client";

import type { ReactNode } from "react";
import { FieldGroup } from "@/components/ui/field";
import { FormDialog } from "@/components/shared/form-dialog";
import { FormActions, TextareaField, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { PORTFOLIO_EDIT_NOTE } from "./portfolio-badge";
import {
  createCertificationAction,
  createEducationAction,
  updateCertificationAction,
  updateEducationAction,
} from "../server/actions";
import {
  certificationSchema,
  educationSchema,
  type CertificationInput,
  type EducationInput,
} from "../schemas";
import type { Certification, Education } from "../server/career-repository";

const EMPTY_EDUCATION: EducationInput = {
  institution: "",
  degree: "",
  fieldOfStudy: "",
  startMonth: "",
  endMonth: "",
  description: "",
};

export function EducationDialog({ education, trigger }: { education?: Education; trigger: ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title={education ? "Edit education" : "Add education"}
      description={education?.fromPortfolio ? PORTFOLIO_EDIT_NOTE : undefined}
    >
      {(close) => <EducationForm education={education} onDone={close} />}
    </FormDialog>
  );
}

function EducationForm({ education, onDone }: { education?: Education; onDone: () => void }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: educationSchema,
    defaultValues: education
      ? {
          institution: education.institution,
          degree: education.degree,
          fieldOfStudy: education.fieldOfStudy,
          startMonth: education.startMonth,
          endMonth: education.endMonth,
          description: education.description,
        }
      : EMPTY_EDUCATION,
    submit: (values) =>
      education ? updateEducationAction({ id: education.id, values }) : createEducationAction(values),
    onSuccess: onDone,
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <TextField form={form} name="institution" label="Institution" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="degree" label="Degree" placeholder="e.g. BS" />
          <TextField form={form} name="fieldOfStudy" label="Field of study" placeholder="e.g. Information Technology" />
          <TextField form={form} name="startMonth" label="Start" type="month" />
          <TextField form={form} name="endMonth" label="End" type="month" />
        </div>
        <TextareaField form={form} name="description" label="Notes" rows={3} />
        <FormActions pending={pending} onCancel={onDone} />
      </FieldGroup>
    </form>
  );
}

const EMPTY_CERTIFICATION: CertificationInput = {
  name: "",
  issuer: "",
  issuedMonth: "",
  expiresMonth: "",
  credentialUrl: "",
};

export function CertificationDialog({
  certification,
  trigger,
}: {
  certification?: Certification;
  trigger: ReactNode;
}) {
  return (
    <FormDialog trigger={trigger} title={certification ? "Edit certification" : "Add certification"}>
      {(close) => <CertificationForm certification={certification} onDone={close} />}
    </FormDialog>
  );
}

function CertificationForm({ certification, onDone }: { certification?: Certification; onDone: () => void }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: certificationSchema,
    defaultValues: certification
      ? {
          name: certification.name,
          issuer: certification.issuer,
          issuedMonth: certification.issuedMonth,
          expiresMonth: certification.expiresMonth,
          credentialUrl: certification.credentialUrl,
        }
      : EMPTY_CERTIFICATION,
    submit: (values) =>
      certification
        ? updateCertificationAction({ id: certification.id, values })
        : createCertificationAction(values),
    onSuccess: onDone,
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="name" label="Certification" />
          <TextField form={form} name="issuer" label="Issuer" />
          <TextField form={form} name="issuedMonth" label="Issued" type="month" />
          <TextField form={form} name="expiresMonth" label="Expires" type="month" />
        </div>
        <TextField form={form} name="credentialUrl" label="Credential URL" type="url" placeholder="https://" />
        <FormActions pending={pending} onCancel={onDone} />
      </FieldGroup>
    </form>
  );
}
