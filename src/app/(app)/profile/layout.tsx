import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileTabs } from "@/features/profile/components/profile-tabs";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader
        title="Profile"
        description="Your verified professional record. Matching and every generated document use only what is here."
      />
      <ProfileTabs />
      {children}
    </>
  );
}
