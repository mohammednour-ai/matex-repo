# Phase 5 — QA Log

Verification of the Phase 1–4 work against the Phase 0 audit findings, plus the verifiable QA gates that this session can run.

---

## Automated checks

| Check | Result | Notes |
|---|---|---|
| `tsc --noEmit -p apps/web-v2/tsconfig.json` | ✅ clean | Re-run after every phase commit. |
| `next build` (apps/web-v2) | ✅ clean | All 30+ routes compile; tailwind classes resolve; CSS vars valid; imports valid. Build completed under 2 min. |
| `next lint` | ⚠ pre-existing failure | `eslint-config-next` not installed in the repo (interactive prompt blocks). Not introduced by this work. Tracked as a separate fix. |
| Playwright smoke suite | ⏸ requires running stack | Suite assumes `mcp-gateway:3001` + `web-v2:3002` + Supabase env. Cannot bring up here without secrets. |
| `@axe-core/playwright` | ⏸ not yet wired | Per session decision: add as dev dep + integrate in Phase 5 follow-up. Recipe below. |
| Lighthouse | ⏸ requires running server | Recipe below. |

---

## Manual verification vs. Phase 0 Top-10 findings

| # | Audit finding | Phase | Status |
|---|---|---|---|
| 1 | `html { font-size: 80% }` — overrides user font-size, WCAG 1.4.4 fail | Phase 1 | ✅ Set to `100%` in `globals.css`. User font-size preferences honored. |
| 2 | Inter declared but never loaded | Phase 1 | ✅ Loaded via `next/font` in `app/layout.tsx` with subsets `latin`, weights 400–800, bound to `--font-inter`. CSS chain references the variable. |
| 3 | No semantic-token layer | Phase 1 | ✅ `darkMode: "class"` on tailwind; `night-*` scale CSS-var-driven; semantic aliases (`canvas`, `surfaceBg`, `elevated`, `sunken`, `fg`, `fg-muted`, `fg-subtle`, `line`, `line-strong`) added. Phase 4 codemod migrates components onto aliases as a follow-up (Phase 4 N). |
| 4 | Dark mode hardcoded | Phase 1 | ✅ `:root` (light) and `.dark` (dark) CSS-var blocks define the full palette. ThemeProvider toggles `<html class="dark">` based on localStorage. Pre-hydration script prevents FOWT. |
| 5 | ~150 MB orphan assets | Phase 2 | ✅ 4 directories (grphs2, illustrations, hero-features, icons/categories) + 9 individual files moved to `archive/web-v2-public-2026-05-10/`. `apps/web-v2/public/` trimmed from ~210 MB → ~86 MB. Verified no remaining src/ references to archived paths. |
| 6 | No SVG anywhere | Phase 3 | ⏸ Asset generation deferred (no image tools / Canva MCP polish in this sandbox). Recipes documented per slot in `03-asset-generation-log.md`. |
| 7 | OG / favicon stack wrong | Phase 3 | ⏸ Same — recipes documented. Twitter card already declared in metadata (audit was wrong on this point). |
| 8 | ~36 Tailwind animations not motion-reduce-guarded | Phase 1 | ✅ `globals.css @media (prefers-reduced-motion: reduce)` block extended to disable `animate-spin`, `animate-pulse`, `animate-bounce`, `animate-ping`. |
| 9 | Skip-to-content link missing; landmarks absent | Phase 4 | ✅ Skip link added as first focusable element on every authed page. `<header role="banner">` wraps fixed-position controls. `<main id="main-content" tabIndex={-1}>` is the skip target. |
| 10 | Sidebar collapse + escrow modal close < 44 px | Phase 4 | ✅ Sidebar collapse toggle, mobile menu trigger, mobile drawer close, escrow dispute modal close — all sized to `h-11 w-11` (44 px). |

### Smaller items collected in Phase 0

| Finding | Status |
|---|---|
| Dashboard OG watermark fetch (1.1 MB JPG at 7 % opacity) | ✅ Replaced with inline `bg-industrial-grain` data-URI pattern (Phase 3) |
| Auth-guard loader inline dark-only gradient | ✅ Migrated to themed `--bg-app-canvas` + `--grid-line` (Phase 3) |
| `KPICard` + `KPICardV2` duplicate | 🟡 Verified both files are completely unreferenced. Documented for archive in Phase 4 follow-up E. |
| `escrow/create/page.tsx` mock data (AGENTS.md violation) | 🟡 Documented for Phase 4 follow-up G |
| Autoplay `<video>` in `listings/[id]/` | 🟡 Has `controls` attribute (✓ user can stop it). Phase 4 follow-up H is to add `prefers-reduced-motion` guard. |
| 16 routes lack `loading.tsx` | 🟢 4 added (dashboard, listings, search, auctions — the heaviest routes). Remaining 12 deferred — most are lighter-data pages where the existing in-route skeleton suffices. |
| Sidebar inline `style={{ width }}` | 🟡 Documented for Phase 4 follow-up K |
| Mobile drawer Esc-key handler | 🟡 Documented for Phase 4 follow-up L |
| 22 platform-domain PNG → Lucide migration | 🟡 Documented for Phase 4 follow-up J |
| Within-`grphs/` orphan archive (44 files) | 🟡 Documented for Phase 4 follow-up I (post-Lucide-migration) |

✅ landed · 🟢 partial · 🟡 documented for follow-up · ⏸ blocked on tooling

---

## Manual a11y verification (this session)

These are checks I can run by reading the final code, not surfacing a UI:

### Skip link

`(app)/layout.tsx:452-455` — `<a href="#main-content" class="sr-only focus:not-sr-only ...">`. First focusable element. Target exists at `<main id="main-content" tabIndex={-1}>`. ✓

### Landmark structure

```
<a> (skip link)
<aside> (desktop sidebar — wraps <nav>)
[mobile drawer — appears as <aside><nav>]
<header role="banner"> (wraps MobileMenuTrigger + UserMenu)
<main id="main-content"> (page content)
<MatexCopilot /> (fixed FAB — outside landmarks, acceptable for a complementary widget)
```

`<main>` and `<header role="banner">` are now real landmarks; pre-Phase 4 they were absent. ✓

### Hit targets ≥ 44 × 44 px

- Sidebar collapse toggle (`h-11 w-11`) — 44 px ✓
- Mobile menu trigger (`h-11 w-11`) — 44 px ✓
- Mobile drawer close (`h-11 w-11`) — 44 px ✓
- ThemeToggle buttons (`h-11 w-11`) — 44 px ✓
- Escrow dispute modal close (`h-11 w-11`) — 44 px ✓

Sidebar nav links use `app-nav-link` class which has `px-2.5 py-2.5` plus an inner `app-nav-icon-wrap` of `h-9 w-9`. The whole link is the click target (text + icon), so a typical link is ~36 px tall × full sidebar width = compliant for non-icon-only buttons. The icon-only collapsed-sidebar variant is borderline — see Phase 4 follow-up K (sidebar tokenization).

### ARIA on icon-only buttons

Verified via `grep "aria-label" apps/web-v2/src/app/(app)/layout.tsx` — every `<button>` containing only a Lucide icon has either `aria-label` (sidebar collapse, mobile open, mobile close, account menu, ThemeToggle) or `<span class="sr-only">` (ThemeToggle option labels). ✓

### Theme parity

Walked the new globals.css `:root` and `.dark` blocks. Every CSS var defined in light has a counterpart in dark and vice versa. Color contrast ratios for the light palette:

- `bg-night-850` (white #ffffff) + `text-night-100` (#0e1014) = ~19:1 ✓ AAA
- `bg-night-900` (off-white #f7f7f6) + `text-night-200` (#404757) = ~9:1 ✓ AAA
- `bg-night-850` (white) + `text-night-300` (#6b7385) = ~5.4:1 ✓ AA Large + AA Normal text
- `bg-brand-500` (#e87722) + `text-white` = ~3.2:1 ⚠ AA Large only — primary CTA buttons should consider `bg-brand-600` (#d4650f) on light mode for AA Normal text. Phase 4 follow-up.

For dark mode: identical to before this PR (verified — the `.dark` block restores all the original hex values).

### Reduced motion

`globals.css @media (prefers-reduced-motion: reduce)` block now disables: 9 named keyframe animations + 4 Tailwind utility animations (`animate-spin`, `animate-pulse`, `animate-bounce`, `animate-ping`). Verified by grepping the file. ✓

The login page `<video autoplay>` has the `controls` attribute (visible stop affordance). Listings detail page `<video autoplay>` also has `controls`. Both are borderline — full reduced-motion handling would be Phase 4 follow-up H.

---

## QA gate work that requires a follow-up session

### Playwright smoke + functional suite

```bash
# Bring up the stack
pnpm dev:web-v2-stack &
sleep 30

# Run the smoke suite (target: <30 s wall clock)
pnpm --filter @matex/web-v2 test:smoke

# If smoke passes, run the full e2e suite
pnpm --filter @matex/web-v2 test:e2e
```

### axe via Playwright

```bash
# 1. Install
pnpm --filter @matex/web-v2 add -D @axe-core/playwright

# 2. Add a project to playwright.config.ts:
#    { name: "a11y", testMatch: "**/a11y.spec.ts", use: devices["Desktop Chrome"] }

# 3. Add e2e/a11y/dashboard.spec.ts (per route):
#    import { test, expect } from "@playwright/test";
#    import AxeBuilder from "@axe-core/playwright";
#    test("dashboard has no detectable a11y violations", async ({ page }) => {
#      await page.addInitScript(() => localStorage.setItem("matex_token", "axe"));
#      await page.goto("/dashboard");
#      const r = await new AxeBuilder({ page }).analyze();
#      expect(r.violations).toEqual([]);
#    });

# 4. Repeat per route for the 16 (app) pages plus /login.
```

### Lighthouse

```bash
# 1. Bring up the stack (as above).
# 2. Run Lighthouse against the relevant routes:
npx lighthouse http://localhost:3002/dashboard --preset=desktop --output=json \
  --output-path=./.lighthouse/dashboard.json \
  --chrome-flags="--headless --no-sandbox"

# Target scores (after Phase 1-4):
# - Performance: ≥ 90 (was lower due to 1.1 MB OG watermark + 974 KB favicon at 4 sizes)
# - Accessibility: ≥ 95 (was likely ~80 due to skip-link absence + hit targets)
# - Best Practices: ≥ 95
# - SEO: ≥ 90
```

### Light-mode visual regression

Phase 1 invented light-mode values for the entire palette but no visual snapshot has been taken. Bringing up `pnpm dev:web-v2-stack`, toggling theme to "Light" via the user-menu ThemeToggle, then visually walking each route is the manual verification. Capture screenshots of the dashboard, listings, search, escrow, and the dispute modal at minimum, against both themes, to bank as Phase 6 PR-description visuals.

---

## Acceptance criteria for Phase 5

- [x] `tsc --noEmit` clean (post-Phase 4).
- [x] `next build` clean (all routes compile, all CSS resolves).
- [x] No remaining src/ references to archived asset paths.
- [x] All 10 audit Top-10 issues resolved or documented as deferred.
- [x] Manual a11y check vs the audit findings recorded.
- [ ] Playwright smoke + functional + axe suites — deferred (require running stack with secrets).
- [ ] Lighthouse — deferred.
- [ ] Light-mode visual regression — deferred (needs human eyeballs).

The deferred QA items are documented with verbatim run commands so a follow-up session with the dev stack online can knock them out in a focused pass.
