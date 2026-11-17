"use client";

import { useTransition } from "react";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteResumeAction, setDefaultResumeAction } from "../server/actions";

export function SetDefaultResumeButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setDefaultResumeAction({ id });
          if (result.ok) toast.success("Default resume updated.");
          else toast.error(result.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Star aria-hidden />} Make default
    </Button>
  );
}

export function DeleteResumeButton({ id, name }: { id: string; name: string }) {
  return (
    <DeleteButton
      itemLabel={name}
      description="The resume version and its uploaded file are permanently deleted."
      onDelete={() => deleteResumeAction({ id })}
    />
  );
}
