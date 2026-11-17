import Link from "next/link";
import { ChevronRight, CircleCheck, CircleDashed, UserRound } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import type { ProfileCompleteness } from "@/features/profile/server/profile-repository";

interface ChecklistItem {
  label: string;
  detail: string;
  done: boolean;
  href: string;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function checklist(c: ProfileCompleteness): ChecklistItem[] {
  return [
    {
      label: "Personal information",
      detail: c.hasBasics ? "Name, headline and summary set" : "Add your name, headline and summary",
      done: c.hasBasics,
      href: "/profile",
    },
    {
      label: "Experience",
      detail: c.experienceCount ? plural(c.experienceCount, "role") : "Add your work history",
      done: c.experienceCount > 0,
      href: "/profile/experience",
    },
    {
      label: "Skills",
      detail: c.skillCount ? plural(c.skillCount, "skill") : "Add the technologies you use",
      done: c.skillCount > 0,
      href: "/profile/skills",
    },
    {
      label: "Education",
      detail: c.educationCount ? plural(c.educationCount, "entry") : "Add degrees or courses",
      done: c.educationCount > 0,
      href: "/profile/education",
    },
    {
      label: "Projects",
      detail: c.projectCount ? plural(c.projectCount, "project") : "Optional — add work you can show",
      done: c.projectCount > 0,
      href: "/profile/projects",
    },
    {
      label: "Resume versions",
      detail: c.resumeCount ? plural(c.resumeCount, "version") : "Create at least one resume version",
      done: c.resumeCount > 0,
      href: "/resumes",
    },
  ];
}

/** Readiness for job matching, computed from real profile rows. */
export function ProfileReadinessCard({ completeness }: { completeness: ProfileCompleteness }) {
  const items = checklist(completeness);
  const doneCount = items.filter((item) => item.done).length;

  return (
    <SectionCard
      title="Profile readiness"
      icon={UserRound}
      description="Job scoring and generated documents only use what your profile contains."
      action={
        <span className="text-sm font-semibold tabular-nums">
          {doneCount}/{items.length}
        </span>
      }
    >
      <div
        className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Profile readiness"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={doneCount}
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="group flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors duration-150 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {item.done ? (
                <CircleCheck className="size-4 shrink-0 text-success" aria-label="Done" />
              ) : (
                <CircleDashed className="size-4 shrink-0 text-subtle-foreground" aria-label="To do" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-subtle-foreground group-hover:text-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
