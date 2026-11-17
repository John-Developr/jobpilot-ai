# Color tokens

Defined in `src/app/globals.css` (`:root` = light, `.dark` = dark). Use the Tailwind utility in the last column.

## Surfaces and text

| Token | Light | Dark | Utility |
| --- | --- | --- | --- |
| background | `#f2f2f2` | `#0d1117` | `bg-background` |
| foreground | `#282a36` | `#e6edf3` | `text-foreground` |
| card / popover | `#ffffff` | `#161b22` | `bg-card`, `bg-popover` |
| muted (subtle fill) | `#f5f5f5` | `#1c2128` | `bg-muted` |
| secondary | `#f0f0f0` | `#21262d` | `bg-secondary` |
| accent (hover fill) | `#ebebeb` | `#262c36` | `bg-accent` |
| muted-foreground | `#5c636d` | `#8b949e` | `text-muted-foreground` |
| subtle-foreground | `#7d8590` | `#7d8590` | `text-subtle-foreground` (meta only) |
| border | `#e5e5e5` | `#30363d` | `border` (default) |
| input | `#e1e1e1` | `#30363d` | `border-input` |
| ring | `#476fff` | `#476fff` | `ring-ring` |

## Actions and brand

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| primary | `#282a36` | `#3b5ff5` | Primary buttons, selected states |
| primary-foreground | `#ffffff` | `#ffffff` | Text on primary |
| brand | `#476fff` | `#476fff` | Fills, chart series 1, focus ring |
| brand-text | `#3b5ff5` | `#7a96ff` | Blue text/links (AA) |
| brand-soft | blue @ 10% | blue @ 14% | Selected rows, info backgrounds |

## States

| State | Light fg | Dark fg | Soft bg | Use |
| --- | --- | --- | --- | --- |
| success | `#1a7f4b` | `#3fb950` | `bg-success-soft` | Applied, window open, saved |
| warning | `#b45309` | `#d29922` | `bg-warning-soft` | Manual review, needs attention |
| destructive | `#c2332f` | `#f85149` | `bg-destructive-soft` | Failed, rejected, paused, delete |
| info | `#3b5ff5` | `#7a96ff` | `bg-info-soft` | Neutral notices |

## Charts

`chart-1` brand blue · `chart-2` neutral (charcoal / gray) · `chart-3` success · `chart-4` warning · `chart-5` destructive.
Use at most three series per chart; prefer `chart-1` + `chart-2`.

## Skeleton

`skeleton` `#f1f1f1` / `#1e2330`, `skeleton-shine` `#e4e4e4` / `#252b3b` (portfolio values), animated with `animate-shimmer`.

## Adding a token

Add it to both themes, map it in `@theme inline`, document it here. Never add a color directly in a component.
