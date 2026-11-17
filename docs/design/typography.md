# Typography

**Family:** Karla (Google Fonts via `next/font`, variable `--font-karla`) for UI and headings — same as the portfolio.
**Mono:** system stack `ui-monospace, SFMono-Regular, Consolas, …` (no extra download) for IDs, code, logs.

## Scale

| Role | Utility | Size / line | Weight | Example |
| --- | --- | --- | --- | --- |
| Page title | `text-2xl font-bold` | 24px | 700 | "Dashboard." |
| Auth title | `text-xl font-bold` | 20px | 700 | "Sign in." |
| Brand wordmark | `text-lg font-extrabold` | 18px | 800 | JobPilot**AI** |
| Card title | `text-sm font-bold` | 14px | 700 | "Submission window." |
| Body / UI | `text-sm` | 14px / 20px | 400–500 | Inputs, table cells, nav |
| Prose | `text-prose` | 15px / 1.6 | 400 | Job descriptions, generated letters |
| Secondary | `text-xs text-muted-foreground` | 12px / 16px | 400 | Descriptions, helper text |
| Meta label | `text-2xs uppercase tracking-wider text-subtle-foreground` | 11px / 16px | 600 | "DAYS", nav section labels |

## Rules

- Headings use `tracking-tight` (set globally for h1–h4).
- Page and section titles end with a period, echoing the portfolio. Do not add periods to buttons, labels or nav items.
- Weights in use: 400, 500, 600, 700, 800. Do not introduce others.
- Numbers in tables/metrics: add `tabular-nums`.
- Truncate single-line labels with `truncate`; clamp multi-line previews with `line-clamp-2`.
