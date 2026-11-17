# Design system

JobPilot AI is a natural extension of the owner's portfolio (johncarlo-portfolio.vercel.app),
inspected on 2026-11-17 (CSS custom properties + Playwright screenshots, light/dark/mobile).

## What the portfolio does

| Aspect | Portfolio | JobPilot adoption |
| --- | --- | --- |
| Canvas | `#f2f2f2` light / `#0d1117` dark | Same |
| Surfaces | White / `#161b22` cards, no border, ~12px radius, soft shadow on hover | `SectionCard`: same surface, `shadow-card`, ~11px radius |
| Action color | Charcoal `rgb(40,42,54)` light, blue `#476fff` dark | `primary` token follows the same split |
| Typeface | Karla (200–800) | Karla via `next/font` |
| Section titles | Small bold label + outline icon + trailing period ("Experience.") | `SectionCard` title and `PageHeader` add the period |
| Inner items | 1px border tiles, 8px radius | `rounded-lg border` rows/tiles |
| Badges | 8px radius, 1px border, 10–11px text | `rounded-md` badges, `text-2xs`/`text-xs` |
| Motion | 0.2s ease; transforms `cubic-bezier(.22,1,.36,1)`; reduced-motion respected | `ease-out-expo` token, 150–300ms, global reduced-motion rule |
| Breakpoints | 850px, 462px | Tailwind `sm/md/lg` (640/768/1024) — see responsive guidelines |
| Content width | 970px single column | 1152px (`max-w-6xl`) main column next to a 240px sidebar |

Not adopted: the "liquid glass" floating buttons (glassmorphism is out of scope for a data-dense app) and
the intro splash.

## Principles

1. **Quiet surfaces, strong type.** Hierarchy comes from weight and size, not color.
2. **One accent.** Brand blue `#476fff` is the only hue besides state colors (success/warning/destructive).
3. **Dense but breathable.** 14px UI text, 15px prose, 20–24px card padding, 20px gaps between cards.
4. **Honest UI.** No fake numbers, placeholder charts or dead buttons. Empty states explain what will appear and why.
5. **Every state designed.** Loading (skeleton shimmer), empty, error, success, warning.

## Token source

All tokens are CSS variables in `src/app/globals.css`, exposed to Tailwind through `@theme inline`.
Components use utilities (`bg-card`, `text-muted-foreground`, `shadow-card`, `rounded-xl`) — never hex values.

- Colors: [color-tokens.md](color-tokens.md)
- Type: [typography.md](typography.md)
- Components & states: [components.md](components.md)
- Layout & spacing: [layouts.md](layouts.md), [responsive-guidelines.md](responsive-guidelines.md)

## Scales

| Scale | Values |
| --- | --- |
| Spacing | Tailwind 4px grid. Common: 1.5 (6px) icon gaps, 2.5 (10px) nav padding, 4–5 (16–20px) card gaps, 5–6 (20–24px) card padding |
| Radius (`--radius: 8px`) | `sm` 4.8px · `md` 6.4px (badges) · `lg` 8px (buttons, inputs, tiles) · `xl` 11.2px (cards, dialogs) · `full` (avatars, dots) |
| Shadow | `shadow-card` resting cards · `shadow-raised` hover/popover · `shadow-overlay` dialogs/sheets |
| Motion | 150ms color/background · 200ms general · 300ms transforms with `ease-out-expo` |

## Accessibility

- Text contrast ≥ 4.5:1. `muted-foreground` (`#5c636d` / `#8b949e`) passes on cards and canvas;
  `subtle-foreground` (`#7d8590`) is for non-essential meta text only.
- Blue as text uses `brand-text` (`#3b5ff5` light, `#7a96ff` dark); the dark-mode button fill is `#3b5ff5`
  (5.1:1 with white) instead of the portfolio's `#476fff` (4.2:1).
- Focus: 3px ring at `ring/50` on every interactive element.
- Status is never conveyed by color alone (labels accompany dots/pills).
