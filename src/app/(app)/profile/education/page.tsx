import type { Metadata } from "next";
import { Award, ExternalLink, GraduationCap } from "lucide-react";
import { requireUser } from "@/server/auth";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { CertificationDialog, EducationDialog } from "@/features/profile/components/education-dialogs";
import { AddButton, DeleteProfileItem, EditButton } from "@/features/profile/components/item-controls";
import { listCertifications, listEducation } from "@/features/profile/server/career-repository";
import { formatMonth, formatMonthRange } from "@/features/profile/convert";
import { PortfolioBadge } from "@/features/profile/components/portfolio-badge";

export const metadata: Metadata = { title: "Education · Profile" };

export default async function EducationPage() {
  const ctx = await requireUser();
  const [education, certifications] = await Promise.all([listEducation(ctx), listCertifications(ctx)]);

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Education"
        icon={GraduationCap}
        action={<EducationDialog trigger={<AddButton label="Add education" />} />}
      >
        {education.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No education yet" description="Add degrees, diplomas and relevant courses." />
        ) : (
          <ul className="flex flex-col gap-3">
            {education.map((item) => {
              const degree = [item.degree, item.fieldOfStudy].filter(Boolean).join(", ");
              return (
                <li key={item.id} className="flex items-start gap-2 rounded-lg border p-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      {item.institution}
                      {item.fromPortfolio ? <PortfolioBadge /> : null}
                    </h3>
                    {degree ? <p className="text-sm text-muted-foreground">{degree}</p> : null}
                    <p className="mt-0.5 text-2xs text-subtle-foreground uppercase">
                      {formatMonthRange(item.startMonth, item.endMonth)}
                    </p>
                    {item.description ? <p className="mt-2 text-sm whitespace-pre-line">{item.description}</p> : null}
                  </div>
                  <EducationDialog education={item} trigger={<EditButton itemLabel={item.institution} />} />
                  {item.fromPortfolio ? null : <DeleteProfileItem kind="education" id={item.id} itemLabel={item.institution} />}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Certifications"
        icon={Award}
        action={<CertificationDialog trigger={<AddButton label="Add certification" />} />}
      >
        {certifications.length === 0 ? (
          <EmptyState icon={Award} title="No certifications yet" description="Add certifications you hold, with a credential link if available." />
        ) : (
          <ul className="divide-y rounded-lg border">
            {certifications.map((item) => {
              const meta = [
                item.issuer,
                item.issuedMonth ? `Issued ${formatMonth(item.issuedMonth)}` : "",
                item.expiresMonth ? `Expires ${formatMonth(item.expiresMonth)}` : "",
              ].filter(Boolean);
              return (
                <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {item.name}
                      {item.credentialUrl ? (
                        <a
                          href={item.credentialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-text"
                          aria-label={`Open credential for ${item.name}`}
                        >
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      ) : null}
                    </p>
                    {meta.length > 0 ? <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p> : null}
                  </div>
                  <CertificationDialog certification={item} trigger={<EditButton itemLabel={item.name} />} />
                  <DeleteProfileItem kind="certification" id={item.id} itemLabel={item.name} />
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
