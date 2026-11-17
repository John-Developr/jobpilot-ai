import type { Metadata } from "next";
import { FileUser, Plus } from "lucide-react";
import { requireUser } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { EditButton } from "@/features/profile/components/item-controls";
import { TagList } from "@/features/profile/components/tag-list";
import { ResumeDialog } from "@/features/resumes/components/resume-dialog";
import { ResumeFileControl } from "@/features/resumes/components/resume-file-control";
import { DeleteResumeButton, SetDefaultResumeButton } from "@/features/resumes/components/resume-actions";
import { listResumes } from "@/features/resumes/server/resume-repository";

export const metadata: Metadata = { title: "Resumes" };

export default async function ResumesPage() {
  const ctx = await requireUser();
  const resumes = await listResumes(ctx);

  return (
    <>
      <PageHeader
        title="Resumes"
        description="Resume versions for different job categories. The default is used unless an application picks another."
        actions={
          <ResumeDialog
            trigger={
              <Button>
                <Plus aria-hidden /> New version
              </Button>
            }
          />
        }
      />
      <SectionCard title="Versions" icon={FileUser}>
        {resumes.length === 0 ? (
          <EmptyState
            icon={FileUser}
            title="No resume versions yet"
            description="Create a version per job category, then upload the matching PDF or DOCX."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {resumes.map((resume) => (
              <li key={resume.id} className="rounded-lg border p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      {resume.name}
                      {resume.isDefault ? (
                        <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-2xs font-semibold text-brand-text">
                          Default
                        </span>
                      ) : null}
                    </h3>
                    {resume.targetCategory ? (
                      <p className="text-xs text-muted-foreground">{resume.targetCategory}</p>
                    ) : null}
                  </div>
                  <ResumeDialog resume={resume} trigger={<EditButton itemLabel={resume.name} />} />
                  <DeleteResumeButton id={resume.id} name={resume.name} />
                </div>
                {resume.summary ? (
                  <p className="mt-2 line-clamp-3 text-sm whitespace-pre-line">{resume.summary}</p>
                ) : null}
                <TagList items={resume.emphasizedSkills} className="mt-3" />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <ResumeFileControl resume={resume} />
                  {resume.isDefault ? null : <SetDefaultResumeButton id={resume.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
