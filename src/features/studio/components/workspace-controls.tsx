"use client";

import { useState, useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { markReadyAction, setApplicationResumeAction } from "../server/actions";

export function ResumePicker({
  applicationId,
  resumeId,
  resumes,
}: {
  applicationId: string;
  resumeId: string | null;
  resumes: { id: string; name: string; isDefault: boolean }[];
}) {
  const [pending, startTransition] = useTransition();
  const change = (value: string) =>
    startTransition(async () => {
      const result = await setApplicationResumeAction({ applicationId, resumeId: value || null });
      if (result.ok) toast.success("Resume version updated.");
      else toast.error(result.error);
    });

  return (
    <div className="grid gap-1.5 sm:w-64">
      <Label htmlFor="resume-version" className="text-xs">
        Resume version for this application
      </Label>
      <NativeSelect id="resume-version" size="sm" value={resumeId ?? ""} onChange={(event) => change(event.target.value)} disabled={pending}>
        <NativeSelectOption value="">Default resume</NativeSelectOption>
        {resumes.map((resume) => (
          <NativeSelectOption key={resume.id} value={resume.id}>
            {resume.name}
            {resume.isDefault ? " (default)" : ""}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/**
 * Moves the package to "pending approval". If any latest version has grounding
 * warnings, the user must explicitly confirm them first.
 */
export function MarkReadyButton({ applicationId, flaggedSections }: { applicationId: string; flaggedSections: string[] }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (confirmFlags: boolean) =>
    startTransition(async () => {
      const result = await markReadyAction({ applicationId, confirmFlags });
      setConfirming(false);
      if (result.ok) toast.success("Ready for approval. Approve it here or on the Applications page.");
      else toast.error(result.error);
    });

  return (
    <>
      <Button onClick={() => (flaggedSections.length ? setConfirming(true) : submit(false))} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCheck aria-hidden />}
        Mark ready for approval
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some sections have warnings</AlertDialogTitle>
            <AlertDialogDescription>
              {flaggedSections.join(", ")} mention skills or numbers that are not in your verified profile. Only
              continue if every claim is true; otherwise edit the text first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Edit first</AlertDialogCancel>
            <AlertDialogAction onClick={() => submit(true)}>They are accurate — continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
