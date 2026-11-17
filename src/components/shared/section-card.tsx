import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  icon?: LucideIcon;
  /** Right-aligned header content (actions, status badge). */
  action?: ReactNode;
  description?: string;
  className?: string;
  children: ReactNode;
}

/**
 * The primary content container, modelled on the portfolio's section cards:
 * borderless surface, small icon + "Title." heading, generous padding.
 */
export function SectionCard({ title, icon: Icon, action, description, className, children }: SectionCardProps) {
  return (
    <section className={cn("rounded-xl bg-card p-5 text-card-foreground shadow-card md:p-6", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
            {title}.
          </h2>
          {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
