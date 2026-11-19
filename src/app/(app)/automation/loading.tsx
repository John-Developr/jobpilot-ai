import { Skeleton } from "@/components/ui/skeleton";

export default function AutomationLoading() {
  return (
    <div aria-busy="true" aria-label="Loading automation runs">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <Skeleton className="mb-5 h-24 w-full rounded-lg" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
