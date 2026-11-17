import type { Metadata } from "next";
import { Target } from "lucide-react";
import { requireUser } from "@/server/auth";
import { SectionCard } from "@/components/shared/section-card";
import { PreferencesForm } from "@/features/profile/components/preferences-form";
import { getPreferences } from "@/features/profile/server/profile-repository";

export const metadata: Metadata = { title: "Preferences · Profile" };

export default async function PreferencesPage() {
  const ctx = await requireUser();
  const preferences = await getPreferences(ctx);

  return (
    <SectionCard
      title="Job preferences"
      icon={Target}
      description="Used for remote, salary and employment-type compatibility when jobs are scored."
    >
      <PreferencesForm defaultValues={preferences} />
    </SectionCard>
  );
}
