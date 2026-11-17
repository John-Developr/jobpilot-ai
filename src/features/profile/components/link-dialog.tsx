"use client";

import type { ReactNode } from "react";
import { FieldGroup } from "@/components/ui/field";
import { FormDialog } from "@/components/shared/form-dialog";
import { FormActions, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { PORTFOLIO_EDIT_NOTE } from "./portfolio-badge";
import { createLinkAction, updateLinkAction } from "../server/actions";
import { linkSchema, type LinkInput } from "../schemas";
import type { ProfileLink } from "../server/profile-repository";

const EMPTY: LinkInput = { label: "", url: "" };

export function LinkDialog({ link, trigger }: { link?: ProfileLink; trigger: ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title={link ? "Edit link" : "Add link"}
      description={link?.fromPortfolio ? PORTFOLIO_EDIT_NOTE : undefined}
    >
      {(close) => <LinkForm link={link} onDone={close} />}
    </FormDialog>
  );
}

function LinkForm({ link, onDone }: { link?: ProfileLink; onDone: () => void }) {
  const { form, onSubmit, pending } = useActionForm({
    schema: linkSchema,
    defaultValues: link ? { label: link.label, url: link.url } : EMPTY,
    submit: (values) => (link ? updateLinkAction({ id: link.id, values }) : createLinkAction(values)),
    onSuccess: onDone,
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <TextField form={form} name="label" label="Label" placeholder="e.g. Portfolio, GitHub, LinkedIn" />
        <TextField form={form} name="url" label="URL" type="url" placeholder="https://" />
        <FormActions pending={pending} onCancel={onDone} />
      </FieldGroup>
    </form>
  );
}
