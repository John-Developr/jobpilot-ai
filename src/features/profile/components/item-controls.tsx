"use client";

import type { ComponentProps } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteProfileItemAction } from "../server/actions";
import type { ProfileItemKind } from "../schemas";

/* Triggers spread props (incl. React 19 `ref`) so they work as `DialogTrigger asChild` children. */

export function AddButton({ label, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button variant="outline" size="sm" {...props}>
      <Plus aria-hidden /> {label}
    </Button>
  );
}

export function EditButton({ itemLabel, ...props }: ComponentProps<typeof Button> & { itemLabel: string }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${itemLabel}`} {...props}>
      <Pencil aria-hidden />
    </Button>
  );
}

export function DeleteProfileItem({ kind, id, itemLabel }: { kind: ProfileItemKind; id: string; itemLabel: string }) {
  return <DeleteButton itemLabel={itemLabel} onDelete={() => deleteProfileItemAction({ kind, id })} />;
}
