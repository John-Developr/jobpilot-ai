# Responsive guidelines

## Breakpoints (Tailwind defaults)

| Name | Min width | Changes |
| --- | --- | --- |
| base | 0 | Single column, top bar + sheet nav, 16px gutters |
| `sm` | 640px | Header actions inline; form grids go 2–3 columns |
| `md` | 768px | 32px gutters, 24px card padding |
| `lg` | 1024px | Persistent sidebar; two-column page grids |
| `xl` | 1280px | Wider tables; no other changes |

The portfolio switches at 850px; `lg` (1024px) is used for the sidebar because a 240px sidebar plus content
needs more room than the portfolio's single column.

## Rules

- Test at 390px, 768px and 1280px in light and dark before shipping a screen.
- No horizontal page scroll. Wide tables scroll inside `overflow-x-auto`; on mobile prefer stacked cards for kanban.
- Touch targets ≥ 32px high (`h-8` buttons/nav items); icon buttons use `size="icon"`.
- Button labels must not wrap (the portfolio's mobile buttons do; avoid it): shorten text or stack buttons full-width.
- Dialogs become full-width sheets below `sm` when they contain forms.
