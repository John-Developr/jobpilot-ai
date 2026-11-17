import { Skeleton } from "@/components/ui/skeleton";

export default function JobsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading jobs">
      <Skeleton className="mb-2 h-8 w-32" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <div className="flex flex-col gap-5">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </div>
  );
}
