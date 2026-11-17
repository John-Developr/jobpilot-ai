"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/config/navigation";

interface NavLinksProps {
  /** Called after a link is chosen (closes the mobile sheet). */
  onNavigate?: () => void;
}

/** Highlights the current route. Reads the URL, so render inside <Suspense> (fallback: <NavList pathname={null} />). */
export function NavLinks({ onNavigate }: NavLinksProps) {
  return <NavList pathname={usePathname()} onNavigate={onNavigate} />;
}

export function NavList({ pathname, onNavigate }: NavLinksProps & { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-0.5">
          <p className="px-2.5 pb-1 text-2xs font-semibold tracking-wider text-subtle-foreground uppercase">
            {section.label}
          </p>
          {section.items.map((item) => {
            const Icon = item.icon;
            if (item.plannedPhase) {
              return (
                <span
                  key={item.href}
                  aria-disabled="true"
                  title={`Planned for roadmap phase ${item.plannedPhase}`}
                  className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm text-subtle-foreground"
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                  <span className="ml-auto rounded-sm border px-1.5 text-2xs leading-4">Soon</span>
                </span>
              );
            }
            const active = pathname !== null && (pathname === item.href || pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors duration-150",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
