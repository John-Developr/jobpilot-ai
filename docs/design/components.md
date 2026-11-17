# Components

Primitives come from shadcn/ui (`src/components/ui`, Radix base, "nova" style) themed by tokens.
Shared blocks live in `src/components/shared`. Feature components live in `src/features/<feature>/components`.

## Implemented

| Component | Path | Notes |
| --- | --- | --- |
| PageHeader | `shared/page-header.tsx` | Title (+period), description, actions slot |
| SectionCard | `shared/section-card.tsx` | Portfolio-style card: icon + "Title.", optional description and action |
| EmptyState | `shared/empty-state.tsx` | Dashed container, icon, title, explanation, optional action |
| ErrorState | `shared/error-state.tsx` | Used by route `error.tsx`; retry button |
| Skeleton | `ui/skeleton.tsx` | Shimmer with skeleton tokens |
| Nav / shell | `layout/*` | Sidebar, mobile sheet, theme toggle, user menu |
| Form fields | `shared/form-fields.tsx` | `TextField`, `TextareaField`, `NumberField` (empty → null), `SelectField`, `CheckboxField`, `ListField` (string[] as lines/commas), `ChipsField` (multi-select), `FormActions` |
| FormDialog | `shared/form-dialog.tsx` | Dialog that mounts its form fresh on open; children get `close` |
| DeleteButton | `shared/delete-button.tsx` | Icon button + confirmation dialog + toast |
| useActionForm | `hooks/use-action-form.ts` | RHF + Zod + Server Action; maps server field errors back to inputs |
| TagList | `features/profile/components/tag-list.tsx` | Portfolio-style tech badges |

## Variants

| Element | Variants | Usage |
| --- | --- | --- |
| Button | `default` (primary), `outline`, `secondary`, `ghost`, `destructive`, `link`; sizes `xs`/`sm`/`default`/`lg`/`icon*` | One `default` button per area; `destructive` for pause/delete; `ghost` in toolbars |
| Input / Textarea / NativeSelect | default + `aria-invalid` error state | Always inside `Field` with a `FieldLabel` |
| Card | `SectionCard` (primary), bordered tile (`rounded-lg border p-3`) for nested items | Do not nest SectionCards |
| Badge | `default`, `secondary`, `outline`, `destructive`; status pills via soft tokens | Status pills always include text |
| Dialog / AlertDialog / Sheet | shadcn defaults, `rounded-xl`, `shadow-overlay` | AlertDialog for destructive confirmation |
| Table | shadcn `Table`; container `overflow-x-auto` | Sticky header for long lists; `tabular-nums` |
| Toast | `sonner` | Success/failure feedback for mutations |

## States

| State | Pattern |
| --- | --- |
| Loading | Route `loading.tsx` with `Skeleton` blocks matching final layout; buttons show `Loader2` spinner and disable |
| Empty | `EmptyState` explaining what will appear and the real action to get there |
| Error | Route `error.tsx` → `ErrorState`; inline `Alert variant="destructive"` for form errors; `FieldError` per field |
| Success | Toast; status pill `bg-success-soft text-success` |
| Warning | Status pill `bg-warning-soft text-warning`; `Alert` for blocking notices |

## Rules

- Do not edit generated primitives for one screen; compose instead. Theme-wide changes to a primitive are allowed and must be noted in the changelog.
- No component may render data it did not receive from a real source.
