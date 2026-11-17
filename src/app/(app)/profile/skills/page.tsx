import type { Metadata } from "next";
import { Globe, ListPlus, Sparkles, Star } from "lucide-react";
import { requireUser } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { BulkSkillsDialog, SkillDialog } from "@/features/profile/components/skill-dialog";
import { AddButton, DeleteProfileItem, EditButton } from "@/features/profile/components/item-controls";
import { listSkills, type Skill } from "@/features/profile/server/career-repository";
import { PROFICIENCY_LABELS, SKILL_CATEGORIES, SKILL_CATEGORY_LABELS } from "@/config/labels";

export const metadata: Metadata = { title: "Skills · Profile" };

function skillMeta(skill: Skill): string {
  return [
    skill.proficiency ? PROFICIENCY_LABELS[skill.proficiency] : "",
    skill.yearsOfExperience !== null ? `${skill.yearsOfExperience} yr${skill.yearsOfExperience === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function SkillsPage() {
  const ctx = await requireUser();
  const skills = await listSkills(ctx);
  const groups = SKILL_CATEGORIES.map((category) => ({
    category,
    skills: skills.filter((skill) => skill.category === category),
  })).filter((group) => group.skills.length > 0);

  return (
    <SectionCard
      title="Skills"
      icon={Sparkles}
      description="Mark your core skills as primary — they carry more weight when jobs are scored."
      action={
        <div className="flex gap-2">
          <BulkSkillsDialog
            trigger={
              <Button variant="ghost" size="sm">
                <ListPlus aria-hidden /> Add several
              </Button>
            }
          />
          <SkillDialog trigger={<AddButton label="Add skill" />} />
        </div>
      }
    >
      {groups.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No skills yet"
          description="Add the languages, frameworks, platforms and tools you have actually used."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.category}>
              <h3 className="mb-2 text-2xs font-semibold tracking-wider text-subtle-foreground uppercase">
                {SKILL_CATEGORY_LABELS[group.category]}
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.skills.map((skill) => (
                  <li key={skill.id} className="flex items-center gap-1 rounded-lg border py-1.5 pr-1 pl-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {skill.isPrimary ? (
                          <Star className="size-3.5 shrink-0 fill-current text-warning" aria-label="Primary skill" />
                        ) : null}
                        {skill.name}
                        {skill.fromPortfolio ? (
                          <Globe className="size-3 shrink-0 text-brand-text" aria-label="Synced from portfolio" />
                        ) : null}
                      </p>
                      {skillMeta(skill) ? (
                        <p className="truncate text-2xs text-muted-foreground">{skillMeta(skill)}</p>
                      ) : null}
                    </div>
                    <SkillDialog skill={skill} trigger={<EditButton itemLabel={skill.name} />} />
                    {skill.fromPortfolio ? null : <DeleteProfileItem kind="skill" id={skill.id} itemLabel={skill.name} />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
