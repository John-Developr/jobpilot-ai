"use client";

import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface FormDialogProps {
  trigger: ReactNode;
  title: string;
  description?: string;
  /** Receives `close` so the form can dismiss the dialog after a successful save. */
  children: (close: () => void) => ReactNode;
}

export function FormDialog({ trigger, title, description, children }: FormDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {/* Forms mount fresh on every open, so they always start from current data. */}
        {open ? children(() => setOpen(false)) : null}
      </DialogContent>
    </Dialog>
  );
}
