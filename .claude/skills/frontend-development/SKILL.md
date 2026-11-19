---
name: frontend-development
description: How to build JobPilot AI UI — page structure, tokens, shared components, forms, loading/empty/error states, responsive and accessibility checks. Load before creating or changing pages or components.
---

# Frontend development

## New page checklist

1. Route: `src/app/(app)/<route>/page.tsx` (async Server Component) + `loading.tsx` skeleton. Cache Components requires session reads inside Suspense — `loading.tsx` provides it.
2. Start with `const ctx = await requireUser();`, then call the feature repository.
3. Layout: `<PageHeader title="Jobs" description="…" actions={…} />` then a `flex flex-col gap-5` stack of `<SectionCard>`s.
4. Remove `plannedPhase` from the item in `src/config/navigation.ts` once the page is real.

## Patterns

| Need | Use |
| --- | --- |
| Section container | `SectionCard` (`src/components/shared/section-card.tsx`) — title gets a trailing period like the portfolio |
| Inner tiles/rows | `rounded-lg border p-3` on `bg-card` |
| No data | `EmptyState` with an honest description and a real action |
| Failure | route `error.tsx` → `ErrorState` |
| Status pill | `rounded-md px-2 py-0.5 text-xs font-semibold` + `bg-{success,warning,destructive,info}-soft text-{…}` |
| Meta label | `text-2xs uppercase text-subtle-foreground` |
| Long text | `text-prose` |

## Forms

```tsx
const form = useForm<Input>({ resolver: zodResolver(schema), defaultValues });
// submit → startTransition(async () => { const r = await action(values); … })
```
- Map `result.fieldErrors` with `setError`; toast `result.error`.
- Use `Field`, `FieldLabel`, `FieldError`, `FieldDescription` from `@/components/ui/field`; `aria-invalid` on inputs.
- Disable submit while pending and when the form is not dirty.

## Tokens

Only Tailwind utilities backed by `src/app/globals.css`. Light theme: `#f2f2f2` canvas, white cards, charcoal primary. Dark: `#0d1117` canvas, `#161b22` cards, blue primary. Full reference: `docs/design/color-tokens.md`.

## Live AI UI

- Progress shows real server events only (Ask JobPilot: `src/features/assistant/progress.ts`); pacing for readability is fine, invented steps are not.
- Render model text with `FormattedText` (`features/assistant/components/assistant-parts.tsx`): lists and bold as React elements, never `dangerouslySetInnerHTML`.
- Format dates with the user's timezone from settings (`formatDate` / `formatDateTime`) to avoid hydration mismatches.
- Animated text uses the `text-shimmer` utility (theme tokens, respects reduced motion).

## Verify

- 390 / 768 / 1280 px, light and dark.
- Keyboard: tab order, focus rings, Escape closes overlays.
- No horizontal scroll on mobile; tables scroll inside their container.
