# Phase 0 — Dashboard UI Audit

**Scope:** the entire `(app)` route group at `apps/web-v2/src/app/(app)/` — 16 routes plus shared shell. Light + dark mode in scope (currently the app is hardcoded dark).

This document is **inventory and findings only**. No fixes proposed yet — those land in Phase 1 (tokens) and Phase 2 (asset plan).

---

## 1. Route inventory

| Route | Files present | State machine | Empty-state | Modals | Admin guard | Notes |
|---|---|---|---|---|---|---|
| `dashboard/` | `page.tsx` | client | ✓ EmptyState | — | — | OG watermark, ticker, hero, KPIs |
| `admin/` | `page.tsx` | client | ✓ | — | ✓ `isPlatformAdmin` | Should also guard at route level |
| `analytics/` | `page.tsx` | client | ✗ no EmptyState | — | — | Charts via `@tremor/react` |
| `auctions/` | `page.tsx`, `[id]/` | client | ✓ | — | — | Live auction realtime page |
| `chat/` | `page.tsx`, `api/` | client | ✓ | — | — | Copilot full-page; matches FAB |
| `checkout/` | `page.tsx` | client | ✓ | — | — | Payment review |
| `contracts/` | `page.tsx`, `create/` | client | ✓ | — | — | |
| `escrow/` | `page.tsx`, `create/` | client | ✓ | inline modal | — | `create/` uses **mock arrays** ⚠ |
| `inspections/` | `page.tsx` | client | ✓ | — | — | |
| `listings/` | `page.tsx`, `[id]/`, `create/` | client | ✓ | — | — | `[id]/` autoplays a `<video>` ⚠ |
| `logistics/` | `page.tsx` | client | ✓ | — | — | Step tracker, table |
| `market/` | `page.tsx`, `[material]/` | client | ✗ | — | — | Market intelligence dashboard |
| `messages/` | `page.tsx` | client | ✓ | — | — | |
| `notifications/` | `page.tsx` | client | ✓ | — | — | |
| `search/` | `page.tsx` | client | ✓ | — | — | Sticky filter aside `w-[260px]` |
| `settings/` | `page.tsx` | client | ✗ | — | — | |

**Shared shell** — `(app)/layout.tsx`:
- `ClientAuthGuard` reads `localStorage.matex_token` and redirects to `/login` if missing; `ready` flag prevents pre-auth render. ✓ Matches the AGENTS.md rule.
- `Sidebar` — desktop fixed left, mobile drawer with backdrop. Width `72|312` controlled by inline `style={{ width }}`.
- `MobileMenuTrigger`, `UserMenu` — both use `aria-label` and `focus-visible:ring-2`. ✓
- `MatexCopilot` mounted globally as a FAB.
- `<main>` has `style={{ marginLeft: sidebarWidth }}`. Inline-style coupling with sidebar state.
- Decorative dashboard OG watermark using `/grphs/Brand/og-social-share-image-b-og-share.jpg` (1.1 MB JPG) at 7% opacity. Big asset for a watermark.
- **No skip-to-content link.** No `<header>`/`<nav>` landmark element on the shell — only `<aside>` and `<main>`.

**Shell-related components** under `apps/web-v2/src/components/`:
- `layout/`: `AppPageHeader`, `AppSectionCard`, `MatexCopilot`, `CopilotPanel`, `CopilotControlMark`.
- `ui/`: `EmptyState`, `KPICard`, `KPICardV2` ⚠ duplicate, `CountdownTimer`, `MediaUploader`, `Sheet`, `Skeleton`, `shadcn/`.
- `system/`: `PostHogProvider`, `ToastProvider`.

**Missing across all 16 routes:** none of them have `loading.tsx` (no Suspense streaming opportunity used). One `error.tsx` at the group level handles errors for all children — that one is solid.

---

## 2. Visual asset inventory

`apps/web-v2/public/` totals **~210 MB**. Reference counts come from `grep -rln <path> apps/web-v2/src/`.

### Active asset directories

| Directory | Files | Size | Refs | Status |
|---|---|---|---|---|
| `grphs/` | 88 PNG/JPG | ~28 MB | **22** | Canonical — actively rendered |
| `LogoOrangeTrns.png` | 1 | 198 KB | 2 | Sidebar logo (mobile + desktop) |
| `favicon-512.png` | 1 | 974 KB | 1 (root layout) | Used as 32, 192, 512, 180 — same file scaled |
| `login-bg2.mp4` | 1 | 32 MB | 1 (auth/login) | Login background video |
| `login-bg3.mp4` | 1 | 37 MB | 1 (auth/login) | Login background video |
| `LOADING.mp4` | 1 | 1.1 MB | 0 | Orphan |

### Orphan asset directories (zero references in `apps/web-v2/src/`)

| Directory | Files | Size | Status |
|---|---|---|---|
| `grphs2/` | 88 | ~28 MB | **Byte-identical duplicate of `grphs/`** |
| `illustrations/` | 30 | ~36 MB | Never imported |
| `hero-features/` | 6 | ~7.5 MB | Never imported |
| `icons/categories/` | 8 | ~7.9 MB | Never imported (PNG icons that should be SVG) |
| `MatexLogo.png` | 1 | 864 KB | Never imported |
| `LogoOrange.png` | 1 | 1.2 MB | Never imported |
| `dashadv.png` + `dashadv.jpg` | 2 | ~2 MB | Never imported (same image, two formats) |
| `login-bg.png` | 1 | 2 MB | Never imported |
| `login-bg2xx.mp4` + `login-bg3xx.mp4` | 2 | ~60 MB | Never imported |
| `MatexLogox.png` | 1 | 234 KB | Never imported |

**Orphan total: ~150 MB** of unused weight currently shipped to the Vercel CDN.

### Format issues

- **No SVGs anywhere in `public/`.** Every logo, icon, illustration is a raster. The brand mark (`LogoOrangeTrns.png`) is rendered at sizes ranging from `h-16 w-16` (64 px) to `h-32` (128 px) — both well under its intrinsic 320×110, but PNG can't scale crisply for HiDPI without weight cost. **A vector logo would cut ~195 KB → ~5 KB and look sharper.**
- **Single favicon source**: `favicon-512.png` is referenced as 32, 192, 512, and 180-px Apple icon. The 32/180 sizes will be browser-resampled from a 974 KB master — wasteful. Need a properly tiered favicon set (16, 32, 48, 180, 192, 512).
- **Open Graph image**: `/grphs/Brand/og-social-share-image-b-og-share.jpg` is 1,099 KB. OG should be ≤ 600 KB.

### Icon usage

Lucide-react icons are the only iconography in active code (no PNG icons referenced). Imports counted across `apps/web-v2/src/`: **dashboard alone uses ~16 distinct Lucide icons** (LayoutDashboard, Package, Search, Gavel, MessageSquare, ShoppingCart, Shield, Truck, Calendar, FileText, Settings, BarChart3, LineChart, ChevronLeft/Right, Menu, X, UserCog, LogOut). All icons sized via JS prop `size={18}` — consistent.

### Charts

`@tremor/react` is in deps and used in the `analytics/` and `intelligence/` components.

### OG / social

Exactly one OG image declared in `apps/web-v2/src/app/layout.tsx` `metadata.openGraph.images`. No `opengraph-image.tsx` / `twitter-image.tsx` / `icon.tsx` route conventions used. Twitter card is missing.

### Anti-patterns observed

- **Raw `<img>`** used instead of `next/image`: 3 instances. (Most are `next/image` ✓.)
- **`<Image fill>` without `sizes`**: needs verification per file. 5 components use `<Image fill>` — `EmptyState.tsx` does NOT use fill (uses width/height ✓), but the others (`MarketSummaryCard`, `MarketIntelligenceDashboard`, `(auth)/login`, `(app)/layout`) need to be checked.
- **EmptyState images are decorative** (`alt=""` + `aria-hidden`). ✓ Per AGENTS.md rule.
- **OG watermark on dashboard** loads a 1.1 MB image just to render at 7% opacity. Should be a much smaller asset (or a CSS pattern).

---

## 3. Current design-token state

### Color (Tailwind config)

Eight named scales defined in `apps/web-v2/tailwind.config.js`:

| Scale | Steps | Purpose |
|---|---|---|
| `brand` | 50–950 | Matex Orange (logo color `#e87722` at 500) |
| `accent` | 50–950 | Amber — auctions, live, highlights |
| `steel` | 50–950 | Industrial cool neutral |
| `surface` | 50–300 only | Warm off-white (kept "for illustrations") |
| `night` | 100–950 (inverted scale!) | Cool steel-black for dark surfaces |
| `info` | 50–700 | Blue links / info |
| `success` | 50–700 | |
| `warning` | 50–900 | |
| `danger` | 50–700 | |

**Token-system status:** raw scales exist but **there is no semantic-token layer** (`bg.canvas`, `text.primary`, etc.). Components reference scales directly, e.g. `bg-night-850/65`, `text-night-200`, `border-night-700/60`. This works while the app is dark-only but blocks light-mode without rewrite.

**Dark mode status:** `darkMode: 'class'` is **not** configured in tailwind.config.js. `dark:` Tailwind variants are used **0 times** across `apps/web-v2/src/`. The app is effectively hardcoded to a single dark theme using the `night` palette. Light mode is in scope per session decision and will require:
1. Adding `darkMode: "class"` to tailwind config.
2. Defining semantic tokens via CSS vars or theme-extended classes.
3. Migrating components from `bg-night-850` → `bg-surface` (semantic).

**Arbitrary value usage:**
- `bg-[#hex]` / `text-[#hex]` / `border-[#hex]`: **0** instances ✓
- `bg-[linear-gradient(...)]` / `bg-[url(...)]` / `bg-[radial-gradient(...)]`: 8 instances (acceptable for design treatments — sidebar gradient, login canvas, etc.)
- Hardcoded pixel widths: 16 instances; mostly legitimate (`min-w-[600px]` table for horizontal scroll, `min-h-[42px]` textarea). Two questionable: `w-[260px]` sidebar filter aside (should be `w-64` = 256 or `w-72`), `min-w-[20px]` notification badge (fine).

### Typography

- **Font family**: `font-family: Inter, ui-sans-serif, system-ui` declared in `globals.css` and `tailwind.config.js`. **Inter is never actually loaded.** No `next/font` imports in the codebase. The app renders in `ui-sans-serif` / `system-ui` (i.e. SF / Segoe / Roboto) and the user thinks they're seeing Inter. This is a brand-fidelity bug.
- **Type scale**: implicit Tailwind scale; no custom override.
- ⚠ **Critical bug**: `globals.css @layer base` has `html { font-size: 80%; }`. This shrinks the entire root font size to ~12.8 px from 16 px. Every `text-xs` (0.75 rem) becomes ~9.6 px. **This is a WCAG SC 1.4.4 failure** (Resize Text) and overrides user font-size preferences. The fix is `font-size: 100%` (or remove the rule).

### Spacing, radii, shadows

- Spacing: standard Tailwind 4 px scale, no overrides.
- Radii: standard Tailwind scale, plus heavy use of `rounded-2xl` / `rounded-[1.45rem]` / `rounded-[1.75rem]` / `rounded-[2rem]` for organic dashboard cards. Some hardcoded radii values to tokenize.
- Shadows: 6 custom shadows in tailwind config: `card`, `card-hover`, `glow-brand`, `glow-accent`, `industrial-panel`, `industrial-panel-raised`, `brand-ring`. All tuned for **dark** surfaces — `rgba(0,0,0, 0.45–0.92)`. Light-mode equivalents do not exist.

### Motion

- **Animation count**: 37 `animate-*` Tailwind utility usages, plus 9 named keyframe animations in `globals.css` (`gear-rotate`, `login-slide-up`, `login-loader-progress`, `login-reveal-in`, `login-shimmer`, `dashboard-ticker`, `page-enter`, `og-watermark-fade`, `gear-rotate-reverse`).
- **`prefers-reduced-motion` coverage**: `globals.css` has a comprehensive `@media (prefers-reduced-motion: reduce)` block that disables `gear-rotate`, `login-*`, `page-enter`, `dashboard-pulse-strip__track`, `dashboard-og-watermark`. ✓ Solid. **But the 37 `animate-*` Tailwind utilities are unguarded** — `motion-reduce:` modifier used only **1 time** in code. Examples: the auth-guard spinner uses raw `animate-spin` with no motion-reduce escape.
- **No framer-motion in the codebase.** ✓
- **One auto-playing video**: `app/(app)/listings/[id]/page.tsx:175` `<video controls autoPlay>`. Auto-play is OK if muted + reduced-motion guarded; need to verify it has `muted` and a stop affordance.

### Verdict per domain

| Domain | Verdict |
|---|---|
| Color | Solid raw-scale foundation; **needs semantic token layer + light-mode values invented** |
| Typography | **Two bugs first** (`80%` root + Inter not loaded), then ready for scale |
| Spacing/radii | Ready; minor consolidation of arbitrary radii |
| Shadows | **Need light-mode shadow set invented** (current ones assume dark) |
| Motion | **Add `motion-reduce:` to Tailwind animations**; named keyframes already guarded |
| Dark mode | **Re-architect**: enable `darkMode: "class"`, add semantic tokens, migrate components |

---

## 4. A11y baseline

### A. Focus visibility

- `outline-none` / `focus:outline-none` usage: **51 / 36** across `(app)/` and `components/`.
- `focus-visible:` paired styling: **25** instances.
- `focus:` (older pattern): **53** instances.
- **Gap:** ~26 elements remove the default outline without an explicit `focus-visible:` replacement (some have `focus:ring-*` which works under mouse but not always for `:focus-visible`). Should be standardized to `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500`.

### B. Hit-target issues (WCAG 2.5.8 — minimum 44×44 CSS px)

- 1 confirmed undersized button: `app/(app)/escrow/page.tsx:186` — close button has `p-1` and a `size={?}` icon. With 4 px padding + ~14–16 px icon = ~22–24 px hit target.
- Sidebar nav links use `app-nav-link` class with `px-2.5 py-2.5` and an inner `app-nav-icon-wrap` of `h-9 w-9` — **36×36**, below the 44 px target. Acceptable when the link text is part of the click area, but icon-only collapsed mode is below threshold.
- The collapsed sidebar **toggle button** (`<ChevronLeft size={16} />` inside `p-2`): ~32×32. Below threshold.
- The mobile menu trigger button: `p-2.5` + `Menu size={20}` ≈ 40×40. Marginal.

### C. Color-only state signaling

- 8 instances of `bg-(red|green|yellow|orange)-(400|500)` followed by space — most are status dots / badges. Need to verify each is paired with text or icon. Spot-check from sidebar/dashboard suggests most badges include text label, but `dashboard-pulse-strip__item::before` (orange dot) is decorative + accompanied by text — ✓.
- Status badges (`badge-green`, `badge-amber`, `badge-red`) defined in `globals.css` use `bg-{color}-500/15 text-{color}-400 ring-1 ring-{color}-500/30` — color-only without an icon prefix. Adding an icon (e.g. `<CheckCircle size={12}>` for success) would harden against red/green color blindness.

### D. ARIA / semantics

- Icon-only buttons: 18 `aria-label` instances inspected — sidebar toggle, mobile close, account menu, etc. Generally good.
- Click handlers on `<div>`: only **1** instance found. ✓
- Modals / dialogs: dashboard uses `<Sheet>` (Radix Dialog wrapper) — ARIA correct via Radix. The escrow inline modal (custom): need to verify `role="dialog"` and focus trap.
- Form labels: not audited per-input; should be checked in Phase 4.

### E. Layout fragility

- Hardcoded pixel widths: 16 (acceptable for tables/textareas; 2 should be tokenized).
- `truncate` inside flex without `min-w-0`: not measured directly; sidebar nav uses `min-w-0` on the logo container ✓ but other places need spot-checks during Phase 4.
- `<Image fill>` without `sizes`: needs per-file confirmation; 5 candidate files identified.
- Raw `<img>`: 3 instances.

### F. Motion guards

- 37 Tailwind `animate-*` utilities; 1 `motion-reduce:` guard. **~36 unguarded.** This is the largest motion-a11y gap.
- Keyframe animations in `globals.css`: ✓ guarded.
- One autoplay `<video>` in `listings/[id]/page.tsx` — verify `muted` attribute and a "pause" affordance (controls is set, ✓).

### G. State-machine gaps

- 14 of 16 routes import `EmptyState`. Missing imports: `analytics/`, `market/`, `settings/`. (`market/` and `analytics/` may legitimately always have data; `settings/` likely shouldn't have an empty state.)
- 1 page uses mock data: `app/(app)/escrow/create/page.tsx`. **AGENTS.md** forbids this — flag for replacement.
- 0 silent `catch {}` ✓.

### H. Landmarks & skip link

- **No skip-to-content link** in the shell. Required for keyboard-only navigation past the sidebar.
- `<aside>` and `<main>` are used. **No `<header>` or `<nav>` landmark elements** — the sidebar uses `<aside>` instead of `<nav>`, and the user menu is positioned absolutely without a `<header>`. WCAG 1.3.1 (Info and Relationships) and AAA 2.4.13 (Page Break Navigation) prefer landmarks for assistive tech.

---

## 5. Component duplication & dead code

- **`KPICard.tsx` and `KPICardV2.tsx` both exist** in `components/ui/`. Decide which is canonical and remove the other (or rename `V2` → `KPICard` after audit).
- **Two copies of `MatexCopilot`** behavior: full-page `/chat` route + the floating FAB. Both are intentional (per dashboard `QuickAction.copilotNote`) — keep both.
- **`grphs/` and `grphs2/` are byte-identical** — `grphs2/` is dead.
- **Multiple unused logo files** (`MatexLogo.png`, `LogoOrange.png`, `MatexLogox.png`) and unused login backgrounds (`login-bg.png`, `login-bg2xx.mp4`, `login-bg3xx.mp4`).

---

## Top 10 systemic issues (priority order)

1. **`html { font-size: 80%; }` in `globals.css`** — overrides user font-size preferences and shrinks every text utility. Fixing this first will make every other typography decision honest. **WCAG 1.4.4 failure.**
2. **Inter font is declared but never loaded** — no `next/font` import. Brand fidelity bug with zero perf cost to fix.
3. **No semantic-token layer** — components reference raw `night-850/65` etc. Light-mode support requires inventing semantic tokens (`bg.canvas`, `bg.surface`, `text.primary`) and migrating call-sites.
4. **Dark mode is hardcoded** — `darkMode` not configured in tailwind, `dark:` variants used 0 times. Adding light mode is a re-architecture, not a flag flip.
5. **~150 MB of orphan assets shipped** — `grphs2/` (byte-identical dup), `illustrations/` (30 unused), `hero-features/` (6 unused), `icons/categories/` (8 unused), 4 unused logos, 2 unused mp4s. Cleanup should land before Phase 3 generates new assets.
6. **No SVG anywhere** — logos, status badges, category icons all PNG. The single `LogoOrangeTrns.png` (198 KB) → SVG (~5 KB) is the highest-leverage swap; replacing all illustrations with optimized SVG/AVIF is the second.
7. **OG / favicon stack is wrong** — single 974 KB favicon used at 4 sizes; OG image is 1.1 MB; no Twitter card. Should be a properly tiered favicon set + ≤ 600 KB OG + Twitter image.
8. **~36 Tailwind animations not guarded by `motion-reduce:`** — keyframes are guarded in CSS but utility-class animations (`animate-spin`, `animate-pulse`, `animate-bounce`) bypass. Add a Tailwind plugin or sweep manually.
9. **Skip-to-content link missing**; semantic landmarks (`<header>`, `<nav>`) absent from shell. WCAG 2.4.1 (Bypass Blocks) failure.
10. **Sidebar collapse toggle and the escrow modal close button are below 44 px hit target.** Pattern issue likely repeats across icon-only buttons in nested pages — needs a sweep during Phase 4.

### Smaller items collected for Phase 4 sweep

- `KPICard` vs `KPICardV2` duplication.
- `app/(app)/escrow/create/page.tsx` mock data (AGENTS.md violation).
- 1 autoplay `<video>` in `listings/[id]/` — verify `muted` + reduced-motion guard.
- Sidebar `style={{ width }}` inline coupling — could move to CSS var.
- 2 hardcoded widths to tokenize (`w-[260px]` filter aside).
- Loading.tsx files for Suspense streaming (16 routes have none).
- `analytics/`, `market/`, `settings/` lack `EmptyState` import — verify legitimate.

---

**Pause point.** Confirm priorities and any scope changes before Phase 1 (semantic-token system + light-mode invention).
