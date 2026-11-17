import type { Metadata } from "next";
import { BriefcaseBusiness } from "lucide-react";
import { requireUser } from "@/server/auth";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ExperienceDialog } from "@/features/profile/components/experience-dialog";
import { AddButton, DeleteProfileItem, EditButton } from "@/features/profile/components/item-controls";
import { TagList } from "@/features/profile/components/tag-list";
import { PortfolioBadge } from "@/features/profile/components/portfolio-badge";
import { listExperiences } from "@/features/profile/server/career-repository";
import { formatMonthRange } from "@/features/profile/convert";
import { EMPLOYMENT_TYPE_LABELS, REMOTE_TYPE_LABELS } from "@/config/labels";

export const metadata: Metadata = { title: "Experience · Profile" };

export default async function ExperiencePage() {
  const ctx = await requireUser();
  const experiences = await listExperiences(ctx);

  return (
    <SectionCard
      title="Experience"
      icon={BriefcaseBusiness}
      action={<ExperienceDialog trigger={<AddButton label="Add role" />} />}
    >
      {experiences.length === 0 ? (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No experience yet"
          description="Add each role you have held. Job scores compare listings against this history."
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {experiences.map((item) => {
            const meta = [
              item.company,
              item.location,
              item.employmentType ? EMPLOYMENT_TYPE_LABELS[item.employmentType] : "",
              item.remoteType ? REMOTE_TYPE_LABELS[item.remoteType] : "",
            ].filter(Boolean);
            const label = `${item.title} at ${item.company}`;
            return (
              <li key={item.id} className="rounded-lg border p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      {item.title}
                      {item.fromPortfolio ? <PortfolioBadge /> : null}
                    </h3>
                    <p className="text-sm text-muted-foreground">{meta.join(" · ")}</p>
                    <p className="mt-0.5 text-2xs text-subtle-foreground uppercase">
                      {formatMonthRange(item.startMonth, item.endMonth, item.isCurrent)}
                    </p>
                  </div>
                  <ExperienceDialog experience={item} trigger={<EditButton itemLabel={label} />} />
                  {item.fromPortfolio ? null : <DeleteProfileItem kind="experience" id={item.id} itemLabel={label} />}
                </div>
                {item.description ? (
                  <p className="mt-3 text-sm whitespace-pre-line">{item.description}</p>
                ) : null}
                {item.achievements.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    {item.achievements.map((achievement, index) => (
                      <li key={index}>{achievement}</li>
                    ))}
                  </ul>
                ) : null}
                <TagList items={item.technologies} className="mt-3" />
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
