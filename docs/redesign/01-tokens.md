# Phase 1 — Semantic Design Tokens (Light + Dark)

Goal: a single token system that drives both light and dark modes, with **zero churn to component class strings** in this phase. Component migration happens in Phase 4.

---

## Token strategy

**Approach: CSS variables consumed by Tailwind, scoped on `<html>` via `.dark` class.**

- `tailwind.config.js` declares colors as `rgb(var(--color-<name>) / <alpha-value>)` — preserves Tailwind opacity utilities (`bg-night-850/65`).
- `globals.css` defines `:root { --color-...: R G B; }` for **light** and `.dark { --color-...: R G B; }` for **dark**.
- `<ThemeProvider>` (small, no extra dep) toggles the `dark` class on `<html>`, persists choice in `localStorage`, and falls back to `prefers-color-scheme` for first visit.
- A blocking pre-hydration script in `<head>` sets the initial class — prevents the flash of wrong theme (FOWT).

**Why this approach over alternatives**

- Not `next-themes` — adds a dependency and a context for behavior we already need 50 lines of code for.
- Not Tailwind `dark:` modifiers everywhere — would 3× our class string lengths and require touching ~200 component files in Phase 1 instead of Phase 4.
- Not duplicating scales (`light-night-*`, `dark-night-*`) — the whole point of CSS vars is one address per concept.

---

## Token map

### Neutral scale (`night-*`)

The existing `night` 12-step scale is **repurposed as a semantic foreground/surface scale**. Numbers indicate logical role, not lightness — so `night-100` is "primary text" in both modes, even though the actual color flips. Existing component code (`bg-night-850`, `text-night-200`, `border-night-700/60`, etc.) keeps working and themes automatically.

| Token | Role | Light (RGB) | Dark (RGB) | Was (current) |
|---|---|---|---|---|
| `night-100` | Primary text | `14 16 20` | `242 244 247` | `#f2f4f7` |
| `night-200` | Secondary text | `64 71 87` | `184 190 201` | `#b8bec9` |
| `night-300` | Tertiary / muted text | `107 115 133` | `139 146 160` | `#8b92a0` |
| `night-400` | Disabled / faint text | `139 147 164` | `107 114 128` | `#6b7280` |
| `night-500` | Icon stroke (muted) | `174 180 196` | `75 82 96` | `#4b5260` |
| `night-600` | Border strong / hover | `205 209 219` | `56 63 75` | `#383f4b` |
| `night-700` | Border default | `224 226 232` | `43 49 59` | `#2b313b` |
| `night-750` | Dropdown surface | `232 234 239` | `35 40 48` | `#232830` |
| `night-800` | Surface raised (inputs, hover) | `240 240 244` | `26 30 37` | `#1a1e25` |
| `night-850` | Surface (cards, panels) | `255 255 255` | `20 23 28` | `#14171c` |
| `night-900` | Canvas (page) | `247 247 246` | `15 17 21` | `#0f1115` |
| `night-950` | Sunken / extreme | `250 248 245` | `10 10 11` | `#0a0a0b` |

**Light-mode rationale:** warm off-white canvas (`#f7f7f6`, picks up the existing `surface-50` warmth) with pure white card surfaces. Borders use a near-neutral cool gray (`#e0e2e8`) to avoid the muddy "beige border" look. Foreground text starts at `#0e1014` (deep steel-black) for AAA contrast on white.

### Brand scales (literal, mode-stable)

`brand-*`, `accent-*`, `info-*`, `success-*`, `warning-*`, `danger-*` keep their current hex values across light + dark. Contrast is handled at the **semantic alias** layer (next section) — e.g. `text-brand-fg` resolves to `brand-700` on light backgrounds, `brand-400` on dark backgrounds.

The 8 existing scales remain unchanged. No migration needed.

### Semantic aliases (Tailwind theme.extend.colors, new)

These names are added in addition to the raw scales. Phase 4 sweep migrates components to these for clearer intent.

| Alias | Resolves to (light) | Resolves to (dark) |
|---|---|---|
| `bg-canvas` | `night-900` (off-white) | `night-900` (deep steel) |
| `bg-surface` | `night-850` (white) | `night-850` (panel) |
| `bg-elevated` | `night-800` (light gray) | `night-800` (raised) |
| `bg-sunken` | `night-950` (faint warm) | `night-950` (deepest) |
| `text-fg` | `night-100` (deep) | `night-100` (light) |
| `text-fg-muted` | `night-200` | `night-200` |
| `text-fg-subtle` | `night-300` | `night-300` |
| `text-fg-disabled` | `night-400` | `night-400` |
| `border-line` | `night-700` | `night-700` |
| `border-line-strong` | `night-600` | `night-600` |
| `bg-brand` | `brand-600` (AA on white) | `brand-500` (current) |
| `text-brand` | `brand-700` | `brand-400` |
| `bg-brand-soft` | `brand-50` | `brand-500/15` |
| `ring-focus` | `brand-500/40` | `brand-500/40` |

`brand`, `text-brand`, `bg-brand-soft` and `ring-focus` are themed via additional CSS vars.

---

## Typography tokens

| Role | Class | Size | Line | Weight | Tracking |
|---|---|---|---|---|---|
| Display | `text-display` | 2.75rem (44 px) | 1.05 | 800 (black) | -0.02em |
| Title | `text-title` | 2rem (32 px) | 1.15 | 800 | -0.015em |
| Heading | `text-heading` | 1.5rem (24 px) | 1.2 | 700 | -0.01em |
| Subheading | `text-subheading` | 1.125rem (18 px) | 1.35 | 600 | -0.005em |
| Body | `text-body` | 0.9375rem (15 px) | 1.55 | 400 | 0 |
| Body strong | `text-body-strong` | 0.9375rem | 1.55 | 600 | 0 |
| Caption | `text-caption` | 0.8125rem (13 px) | 1.45 | 500 | 0.005em |
| Micro | `text-micro` | 0.6875rem (11 px) | 1.4 | 700 | 0.18em uppercase |

**Font:** Inter loaded via `next/font` with weight subset 400–800, applied via `--font-inter` CSS var. Fallback chain: `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`.

**Critical fix (Phase 0 issue #1):** Remove `html { font-size: 80% }` from `globals.css`. Replace with `font-size: 100%` so user font-size preferences are honored. Components that depended on the global shrink will be re-sized in Phase 4 if they look too large.

---

## Spacing, radii, shadows

- **Spacing:** Tailwind defaults (4 px scale). No overrides.
- **Radii:** Tailwind defaults + 3 organic tokens for dashboard cards: `rounded-card` = 1.25 rem, `rounded-hero` = 1.75 rem, `rounded-display` = 2 rem. Replaces 5 distinct ad-hoc `rounded-[Xrem]` arbitrary values.
- **Shadows:** Each existing shadow gets a light-mode counterpart, declared as separate keys (e.g. `shadow-card` becomes a CSS var that swaps).

| Shadow | Light | Dark |
|---|---|---|
| `shadow-card` | `0 1px 2px rgba(15,17,21,0.04), 0 4px 12px -2px rgba(15,17,21,0.08)` | (current) |
| `shadow-card-hover` | `0 8px 24px -6px rgba(15,17,21,0.12), 0 0 0 1px rgba(15,17,21,0.04)` | (current) |
| `shadow-industrial-panel` | `0 1px 0 0 rgba(15,17,21,0.04), 0 24px 48px -28px rgba(15,17,21,0.20), inset 0 1px 0 0 rgba(255,255,255,0.6)` | (current) |
| `shadow-glow-brand` | `0 0 24px -6px rgba(232,119,34,0.30)` | (current) |
| `shadow-brand-ring` | `0 0 0 3px rgba(232,119,34,0.20)` | (current) |

---

## Motion tokens

Define duration + easing as CSS vars; Tailwind keeps using its own utilities. New: a `motion-safe-anim` utility class wraps `animate-spin`, `animate-pulse`, etc. so they can be killed by reduced-motion globally.

| Token | Value |
|---|---|
| `--ease-standard` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--ease-decelerate` | `cubic-bezier(0, 0, 0.2, 1)` |
| `--ease-accelerate` | `cubic-bezier(0.4, 0, 1, 1)` |
| `--duration-instant` | `100ms` |
| `--duration-fast` | `150ms` |
| `--duration-normal` | `220ms` |
| `--duration-slow` | `350ms` |

**Reduced-motion:** the existing `@media (prefers-reduced-motion: reduce)` block in `globals.css` is extended to also kill `animate-spin`, `animate-pulse`, `animate-bounce`, `animate-ping`. This addresses Phase 0 issue #8.

---

## File-by-file impact (Phase 1 implementation)

| File | Change |
|---|---|
| `apps/web-v2/tailwind.config.js` | Add `darkMode: "class"`. Convert `night` scale to CSS-var refs. Add semantic aliases (`canvas`, `surface`, `elevated`, etc.). Add typography utility plugin entry. Add new radii. |
| `apps/web-v2/src/app/globals.css` | Replace `font-size: 80%` → `100%`. Add `:root` and `.dark` blocks with all CSS vars. Extend reduced-motion block. Add typography utility classes (`.text-display`, `.text-body`, etc.). |
| `apps/web-v2/src/app/layout.tsx` | Load Inter via `next/font` with `--font-inter` variable. Add `<head>` script for FOWT prevention. Wrap `{children}` in `ThemeProvider`. Apply `font-inter` class on `<body>`. |
| `apps/web-v2/src/components/system/ThemeProvider.tsx` | New — ~50 LOC. React context, localStorage persistence, mediaQuery fallback, `<html>` class toggle. |
| `apps/web-v2/src/components/ui/ThemeToggle.tsx` | New — ~30 LOC. Sun/Moon Lucide icon swap. Lives in the user menu (Phase 4 wires it). |

**Components already in production:** zero changes in Phase 1. Existing class strings (`bg-night-850/65`, `text-night-200`, etc.) continue to render — and now flip on theme toggle.

---

## Migration map (for Phase 4 sweep)

When we move to semantic aliases, the rename is mechanical:

| Pattern | Target |
|---|---|
| `bg-night-900` | `bg-canvas` |
| `bg-night-850` | `bg-surface` |
| `bg-night-800` | `bg-elevated` |
| `bg-night-950` | `bg-sunken` |
| `text-night-100` | `text-fg` |
| `text-night-200` | `text-fg-muted` |
| `text-night-300` | `text-fg-subtle` |
| `border-night-700` | `border-line` |
| `border-night-600` | `border-line-strong` |
| `bg-brand-500` | `bg-brand` (themed) |
| `text-brand-400` | `text-brand` (themed) |
| `rounded-[1.45rem]` / `rounded-[1.75rem]` / `rounded-[2rem]` | `rounded-card` / `rounded-hero` / `rounded-display` |

Phase 4 will run a codemod (`tsx scripts/migrate-tokens.ts`) to apply these in bulk, with eyeballing on the diff.

---

## Acceptance criteria for Phase 1

- [ ] Toggling theme on `<html>` produces a coherent light experience (no white-on-white, no missing borders, no invisible focus rings).
- [ ] Existing dark experience is byte-for-byte identical to before (no visual regression).
- [ ] No FOWT — initial render matches persisted preference.
- [ ] User font-size preferences honored (`html { font-size: 100% }`).
- [ ] Inter loads via `next/font` (verify via DevTools Network).
- [ ] `pnpm --filter @matex/web-v2 lint` passes.
- [ ] `pnpm --filter @matex/web-v2 typecheck` passes.

Implementation lands in the same commit as this doc.
