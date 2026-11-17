import Link from "next/link";

export function Brand() {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-baseline gap-1 rounded-md text-lg font-extrabold tracking-tight text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      JobPilot<span className="text-brand-text">AI</span>
    </Link>
  );
}
