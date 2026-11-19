import {
  Bell,
  Bot,
  BriefcaseBusiness,
  ChartColumn,
  FileUser,
  LayoutDashboard,
  ListChecks,
  PenLine,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Roadmap phase that delivers the module. Items with a phase are rendered as
   * non-interactive "Soon" entries until the module ships — no placeholder pages.
   */
  plannedPhase?: number;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Analytics", href: "/analytics", icon: ChartColumn, plannedPhase: 8 },
      { label: "Notifications", href: "/notifications", icon: Bell, plannedPhase: 8 },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
      { label: "Application Studio", href: "/application-studio", icon: PenLine },
      { label: "Applications", href: "/applications", icon: ListChecks },
      { label: "Automation", href: "/automation", icon: Bot },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile", href: "/profile", icon: UserRound },
      { label: "Resumes", href: "/resumes", icon: FileUser },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];
