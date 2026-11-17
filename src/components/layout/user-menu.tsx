import { LogOut } from "lucide-react";
import { requireUser } from "@/server/auth";
import { signOutAction } from "@/features/auth/server/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Signed-in account summary + sign out. Reads the session, so render inside <Suspense>. */
export async function UserMenu() {
  const { email } = await requireUser();
  const initial = (email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={email ?? undefined}>
        {email ?? "Signed in"}
      </span>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out">
          <LogOut aria-hidden />
        </Button>
      </form>
    </div>
  );
}

export function UserMenuSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1.5">
      <Skeleton className="size-8 rounded-full" />
      <Skeleton className="h-3 flex-1" />
    </div>
  );
}
