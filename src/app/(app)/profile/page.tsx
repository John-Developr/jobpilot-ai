import type { Metadata } from "next";
import { ExternalLink, Link2, UserRound } from "lucide-react";
import { requireUser } from "@/server/auth";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { PersonalInfoForm } from "@/features/profile/components/personal-info-form";
import { LinkDialog } from "@/features/profile/components/link-dialog";
import { AddButton, DeleteProfileItem, EditButton } from "@/features/profile/components/item-controls";
import { getPersonalInfo, listLinks } from "@/features/profile/server/profile-repository";
import { getPortfolioSyncStatus } from "@/features/profile/server/portfolio-sync-service";
import { PortfolioSyncCard } from "@/features/profile/components/portfolio-sync-card";
import { PortfolioBadge } from "@/features/profile/components/portfolio-badge";
import { formatDateTime } from "@/features/jobs/format";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const ctx = await requireUser();
  const [{ email, ...personalInfo }, links, sync, settings] = await Promise.all([
    getPersonalInfo(ctx),
    listLinks(ctx),
    getPortfolioSyncStatus(ctx),
    getAutomationSettings(ctx),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PortfolioSyncCard
        config={sync.config}
        lastSyncedLabel={formatDateTime(sync.lastSyncedAt, settings.timezone)}
      />
      <SectionCard title="Personal information" icon={UserRound}>
        <PersonalInfoForm defaultValues={personalInfo} email={email} />
      </SectionCard>

      <SectionCard
        title="Links"
        icon={Link2}
        description="Portfolio, GitHub, LinkedIn and other profiles to include in applications."
        action={<LinkDialog trigger={<AddButton label="Add link" />} />}
      >
        {links.length === 0 ? (
          <EmptyState icon={Link2} title="No links yet" description="Add your portfolio and professional profiles." />
        ) : (
          <ul className="divide-y rounded-lg border">
            {links.map((link) => (
              <li key={link.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {link.label}
                    {link.fromPortfolio ? <PortfolioBadge /> : null}
                  </p>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 truncate text-xs text-brand-text hover:underline"
                  >
                    <span className="truncate">{link.url}</span>
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                </div>
                <LinkDialog link={link} trigger={<EditButton itemLabel={link.label} />} />
                {link.fromPortfolio ? null : <DeleteProfileItem kind="link" id={link.id} itemLabel={link.label} />}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
