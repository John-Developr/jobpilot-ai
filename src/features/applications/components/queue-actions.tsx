"use client";

import { useState, useTransition, type ReactNode } from "react";
import { CircleCheck, Loader2, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ActionResult } from "@/server/action-result";
import type { DbEnum } from "@/types/database";
import { approveApplicationAction, markAppliedAction, withdrawApprovalAction } from "../server/actions";

type Status = DbEnum<"application_status">;

interface ConfirmActionProps {
  label: string;
  icon: ReactNode;
  variant?: "default" | "outline" | "ghost";
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<ActionResult<Status>>;
  success: (status: Status) => string;
}

/** A button that asks for confirmation, runs a Server Action and reports the result. */
function ConfirmActionButton({ label, icon, variant = "outline", title, description, confirmLabel, run, success }: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await run();
      setOpen(false);
      if (result.ok) toast.success(success(result.data));
      else toast.error(result.error);
    });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : icon}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ApproveButton({ applicationId, retry = false }: { applicationId: string; retry?: boolean }) {
  return (
    <ConfirmActionButton
      label={retry ? "Approve again" : "Approve"}
      icon={<CircleCheck aria-hidden />}
      variant="default"
      title={retry ? "Approve this application again?" : "Approve this application?"}
      description="You confirm the documents, screening answers and resume are accurate. It joins the queue and is due inside your submission window. Changing any of them later withdraws the approval."
      confirmLabel="Approve"
      run={() => approveApplicationAction({ applicationId })}
      success={(status) => (status === "scheduled" ? "Approved. Due when the next submission window opens." : "Approved and due now.")}
    />
  );
}

export function WithdrawApprovalButton({ applicationId }: { applicationId: string }) {
  return (
    <ConfirmActionButton
      label="Withdraw approval"
      icon={<Undo2 aria-hidden />}
      variant="ghost"
      title="Withdraw the approval?"
      description="The application leaves the queue and waits for approval again. Nothing is submitted."
      confirmLabel="Withdraw"
      run={() => withdrawApprovalAction({ applicationId })}
      success={() => "Approval withdrawn."}
    />
  );
}

export function MarkAppliedButton({ applicationId }: { applicationId: string }) {
  return (
    <ConfirmActionButton
      label="Mark as applied"
      icon={<Send aria-hidden />}
      title="Mark as applied?"
      description="Only do this after you submitted the application yourself on the job site. It is recorded as a manual submission and counts toward today's limit."
      confirmLabel="Mark as applied"
      run={() => markAppliedAction({ applicationId })}
      success={() => "Marked as applied."}
    />
  );
}
