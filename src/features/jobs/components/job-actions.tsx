"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteJobAction, setJobArchivedAction } from "../server/actions";

export function ArchiveJobButton({ jobId, archived }: { jobId: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  const toggle = () =>
    startTransition(async () => {
      const result = await setJobArchivedAction({ jobId, archived: !archived });
      if (result.ok) toast.success(archived ? "Job restored." : "Job archived.");
      else toast.error(result.error);
    });

  return (
    <Button variant="outline" size="sm" onClick={toggle} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}

export function DeleteJobButton({ jobId, title }: { jobId: string; title: string }) {
  const router = useRouter();
  return (
    <DeleteButton
      itemLabel={title}
      description="The job and its pipeline history are permanently deleted. Archive it instead to keep the record."
      onDelete={async () => {
        const result = await deleteJobAction({ jobId });
        if (result.ok) router.push("/jobs");
        return result;
      }}
    />
  );
}
