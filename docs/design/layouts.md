# Layouts

## App shell (`src/app/(app)/layout.tsx`)

```
┌──────────┬─────────────────────────────────────────┐
│ Sidebar  │  main (max-w-6xl, px-4 → md:px-8)       │
│ 240px    │  PageHeader                             │
│ brand    │  SectionCard                            │
│ nav      │  SectionCard  (gap-5)                   │
│ user     │                                         │
└──────────┴─────────────────────────────────────────┘
```

- Sidebar: `bg-sidebar`, right border, sticky full height, visible from `lg` (1024px).
- Below `lg`: sticky 56px top bar (menu button, brand, theme toggle) and a left `Sheet` with the same nav + user menu.
- Nav sections: Overview, Pipeline, Account. Unbuilt modules show "Soon" and are not links.

## Page anatomy

1. `PageHeader` (title, one-line description, primary actions on the right; stacks on mobile).
2. Content stack: `flex flex-col gap-5` of `SectionCard`s. Two-column layouts use `grid gap-5 lg:grid-cols-3`
   with the main column `lg:col-span-2` (portfolio uses a 2:1 split).
3. Long lists: table inside a SectionCard with pagination at the bottom.

## Auth layout

Centered 384px column on the canvas: wordmark, single card, footnote.

## Spacing rules

- Card padding `p-5 md:p-6`; card gap `gap-5`; form field gap from `FieldGroup`.
- Header → content: `mb-6`. Inside cards: title block `mb-4`; separated sub-sections use `border-t pt-4`.
- Never stack more than three nesting levels of containers.
