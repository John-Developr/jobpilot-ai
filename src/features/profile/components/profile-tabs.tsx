"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/profile", label: "Overview" },
  { href: "/profile/experience", label: "Experience" },
  { href: "/profile/skills", label: "Skills" },
  { href: "/profile/education", label: "Education" },
  { href: "/profile/projects", label: "Projects" },
  { href: "/profile/preferences", label: "Preferences" },
] as const;

export function ProfileTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Profile sections" className="mb-5 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-9 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-150",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
