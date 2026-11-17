import { Skeleton } from "@/components/ui/skeleton";

export default function StudioLoading() {
  return (
    <div aria-busy="true" aria-label="Loading Application Studio">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
