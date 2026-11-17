import type { Metadata } from "next";
import { ExternalLink, FolderGit2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ProjectDialog } from "@/features/profile/components/project-dialog";
import { AddButton, DeleteProfileItem, EditButton } from "@/features/profile/components/item-controls";
import { TagList } from "@/features/profile/components/tag-list";
import { listProjects } from "@/features/profile/server/career-repository";
import { formatMonthRange } from "@/features/profile/convert";
import { PortfolioBadge } from "@/features/profile/components/portfolio-badge";

export const metadata: Metadata = { title: "Projects · Profile" };

export default async function ProjectsPage() {
  const ctx = await requireUser();
  const projects = await listProjects(ctx);

  return (
    <SectionCard
      title="Projects"
      icon={FolderGit2}
      action={<ProjectDialog trigger={<AddButton label="Add project" />} />}
    >
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No projects yet"
          description="Add personal and professional projects that show what you can build."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {projects.map((project) => {
            const meta = [project.role, formatMonthRange(project.startMonth, project.endMonth)].filter(Boolean);
            return (
              <li key={project.id} className="flex flex-col rounded-lg border p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      {project.name}
                      {project.fromPortfolio ? <PortfolioBadge /> : null}
                    </h3>
                    {meta.length > 0 ? <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p> : null}
                  </div>
                  <ProjectDialog project={project} trigger={<EditButton itemLabel={project.name} />} />
                  {project.fromPortfolio ? null : <DeleteProfileItem kind="project" id={project.id} itemLabel={project.name} />}
                </div>
                {project.description ? (
                  <p className="mt-2 line-clamp-4 text-sm whitespace-pre-line">{project.description}</p>
                ) : null}
                {project.highlights.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {project.highlights.map((highlight, index) => (
                      <li key={index}>{highlight}</li>
                    ))}
                  </ul>
                ) : null}
                <TagList items={project.technologies} className="mt-3" />
                {project.url || project.repositoryUrl ? (
                  <div className="mt-3 flex gap-3 text-xs">
                    {project.url ? (
                      <a href={project.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-text hover:underline">
                        Live <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                    {project.repositoryUrl ? (
                      <a href={project.repositoryUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-text hover:underline">
                        Repository <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
