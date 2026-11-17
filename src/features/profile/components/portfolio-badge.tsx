import { Globe } from "lucide-react";

export const PORTFOLIO_EDIT_NOTE =
  "Synced from your portfolio. Fields the portfolio has are replaced on every sync — change those in your portfolio admin. JobPilot-only details (achievements, technologies, proficiency, dates the portfolio lacks) are kept.";

export function PortfolioBadge() {
  return (
    <span
      title="Synced from your portfolio"
      className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-0.5 text-2xs font-semibold whitespace-nowrap text-brand-text"
    >
      <Globe className="size-3" aria-hidden /> Portfolio
    </span>
  );
}
