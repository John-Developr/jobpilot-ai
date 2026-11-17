import { cn } from "@/lib/utils";

/** Portfolio-style tech badges: small, bordered, 6px radius. */
export function TagList({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((item) => (
        <li key={item} className="rounded-md border px-1.5 py-0.5 text-2xs text-muted-foreground">
          {item}
        </li>
      ))}
    </ul>
  );
}
