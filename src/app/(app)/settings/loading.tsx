import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading settings">
      <Skeleton className="mb-2 h-8 w-40" />
      <Skeleton className="mb-6 h-4 w-80" />
      <div className="flex flex-col gap-5">
        <Skeleton className="h-[30rem] w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
