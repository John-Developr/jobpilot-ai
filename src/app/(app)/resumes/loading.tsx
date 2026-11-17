import { Skeleton } from "@/components/ui/skeleton";

export default function ResumesLoading() {
  return (
    <div aria-busy="true" aria-label="Loading resumes">
      <Skeleton className="mb-2 h-8 w-40" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
