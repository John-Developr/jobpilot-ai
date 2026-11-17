import { Suspense, type ReactNode } from "react";
import { Brand } from "@/components/layout/brand";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLinks, NavList } from "@/components/layout/nav-links";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu, UserMenuSkeleton } from "@/components/layout/user-menu";
import { AssistantPanel } from "@/features/assistant/components/assistant-panel";

/**
 * Authenticated application shell. The shell is static; anything that reads the
 * session (user menu, page data) sits behind its own Suspense boundary.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center justify-between px-4">
          <Brand />
          <ThemeToggle />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <Suspense fallback={<NavList pathname={null} />}>
            <NavLinks />
          </Suspense>
        </div>
        <div className="border-t p-2">
          <Suspense fallback={<UserMenuSkeleton />}>
            <UserMenu />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-sidebar/95 px-2 backdrop-blur lg:hidden">
          <div className="flex items-center gap-1">
            <MobileNav
              footer={
                <Suspense fallback={<UserMenuSkeleton />}>
                  <UserMenu />
                </Suspense>
              }
            />
            <Brand />
          </div>
          <ThemeToggle />
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      <AssistantPanel />
    </div>
  );
}
