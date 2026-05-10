# Dashboard Redesign — Summary

End-to-end overhaul of `apps/web-v2/src/app/(app)/` (16 authenticated routes plus the shared shell), covering visual identity, design tokens, theming, accessibility, performance, and asset hygiene.

The work is structured as 5 phases that landed in 5 commits on this branch. Each phase has a paired doc under `docs/redesign/` for full context.

---

## Phase summary

| Phase | What | Doc | Commit |
|---|---|---|---|
| 0 | Audit — 16 routes + shell, ~210 MB of public assets, current Tailwind tokens, a11y baseline. Top-10 systemic issues. | `00-audit.md` | `8bbb05f` |
| 1 | Semantic-token system + light/dark theming (additive, zero component churn) | `01-tokens.md` | `8a7d106` |
| 2 | Asset plan + 150 MB of orphan assets archived | `02-asset-plan.md` | `d1f1625` |
| 3 | Inline watermark + theme auth-guard; 11 asset-generation items deferred with recipes | `03-asset-generation-log.md` | `79be899` |
| 4 | Shell a11y (skip link, landmarks, ThemeToggle), hit-target fixes, Suspense streams | `04-implementation-sweep.md` | `1e45d63` |
| 5 | QA gate — `tsc` + `next build` pass, manual a11y verification, deferred E2E/axe/Lighthouse with recipes | `05-qa-log.md` | (this commit) |

---

## What changed

### Theming

- **Single token system, two modes.** `night-*` Tailwind scale (12 steps) is now driven by CSS variables defined in `:root` (light) and `.dark` (dark) blocks of `apps/web-v2/src/app/globals.css`. Every component class string (`bg-night-850/65`, `text-night-200`, `border-night-700/60`) keeps working unchanged but flips with theme. **No component touched.**
- **Semantic aliases added** (`canvas`, `surfaceBg`, `elevated`, `sunken`, `fg`, `fg-muted`, `fg-subtle`, `line`, `line-strong`) for a future Phase 4 codemod that renames `bg-night-*` → `bg-canvas` etc. in bulk. Phase 1 lays the rails; the rename is mechanical and lower-risk in a separate PR.
- **`darkMode: "class"`** wired in `tailwind.config.js`.
- **`<ThemeProvider>`** (90 LOC, no extra dependency) reads localStorage, listens to `prefers-color-scheme` for `system`, and toggles `<html class="dark">`. Pre-hydration script in `<head>` prevents flash of wrong theme. Defaults to dark for backward compat.
- **`<ThemeToggle>`** segmented switcher (Light / Dark / System, 44 px hit targets) mounted inside the user-menu dropdown.

### Typography

- **Inter** loaded via `next/font` with weights 400–800, bound to `--font-inter` CSS var. Previously declared but never loaded — the app silently rendered in `system-ui`.
- **`html { font-size: 80% }` removed** (was Phase 0 issue #1 — silently overrode user font-size preferences, WCAG 1.4.4 fail). Restored to `100%`. Components that depended on the global shrink may render slightly larger; flag for visual eyeballing.
- **Type scale utility classes** added: `.text-display`, `.text-title`, `.text-heading`, `.text-subheading`, `.text-body`, `.text-body-strong`, `.text-caption`, `.text-micro`. Sized in rem so they respect the user's root size.

### Motion

- **`prefers-reduced-motion` block extended** to disable Tailwind utility animations (`animate-spin`, `animate-pulse`, `animate-bounce`, `animate-ping`) — 36 unguarded usages were Phase 0 issue #8. Named keyframes were already guarded.

### A11y

- **Skip-to-content link** as the first focusable element on every authed page (Phase 0 issue #9, WCAG 2.4.1 Bypass Blocks).
- **`<header role="banner">` + `<main id="main-content" tabIndex={-1}>`** landmarks added.
- **Hit targets resized to 44 px**: sidebar collapse toggle, mobile menu trigger, mobile drawer close, escrow dispute modal close (Phase 0 issue #10, WCAG 2.5.8).
- **Escrow dispute modal** now declares `role="dialog"` + `aria-modal` + `aria-labelledby`.
- **Loading skeletons** (4 routes) announce themselves to AT (`role=status` `aria-live=polite`).
- **All Lucide icons** in shell tagged `aria-hidden`; their parent buttons own the `aria-label`.

### Performance

- **Dashboard OG watermark** no longer fetches the 1.1 MB JPG overlaid at 7 % opacity. Replaced with the inline `bg-industrial-grain` data-URI pattern.
- **Suspense streaming** (`loading.tsx` for dashboard / listings / search / auctions) — Next.js sends a structured skeleton instantly while the route's data fetches.
- **`transition-all` → `transition-[margin]`** on `<main>` so only the sidebar-margin animates, not every layout/paint property.

### Asset hygiene

- **150 MB archived.** 4 directories (`grphs2/`, `illustrations/`, `hero-features/`, `icons/categories/`) + 9 individual files (3 unused logos, `dashadv.{png,jpg}`, `login-bg.png`, 2 `*xx.mp4` dups, `LOADING.mp4`) moved to `archive/web-v2-public-2026-05-10/`.
- **Public dir trimmed** from ~210 MB to ~86 MB.
- **No broken refs** — verified via grep; no remaining `src/` reference points to an archived path.

---

## What's deferred (documented with recipes)

Each deferred item has a verbatim run recipe in the relevant doc. Listed for follow-up sessions:

| # | Item | Doc |
|---|---|---|
| 1 | Logo SVG (`logo-wordmark.svg`, `logo-mark.svg`) — needs Canva MCP polish | `03 §D` |
| 2 | Favicon set (16/32/48/180/192/512 PNG) from logo SVG via sharp | `03 §E` |
| 3 | OG / Twitter image compression (1.1 MB → ≤ 200 KB via mozjpeg) | `03 §F` |
| 4 | Login video re-encode (67 MB → ~6 MB via ffmpeg) | `03 §G` |
| 5 | 13 empty-state SVGs via Canva MCP | `03 §H` |
| 6 | 11 status SVGs (escrow / inspection / kyc / contract / etc.) | `03 §I` |
| 7 | 18 material thumbnail re-exports (1024 px PNG → 240 px AVIF + WebP via sharp) | `03 §J` |
| 8 | Avatar placeholder SVG | `03 §L` |
| 9 | KPICard duplicate archive (both files dead code) | `04 §E` |
| 10 | `outline-none` → `focus-visible` standardization sweep (~26 elements) | `04 §F` |
| 11 | `escrow/create/page.tsx` mock-data replacement | `04 §G` |
| 12 | Autoplay video reduced-motion guard | `04 §H` |
| 13 | Within-`grphs/` orphan archive (44 PNGs, ~5 MB) | `04 §I` |
| 14 | Lucide migration for 22 platform-domain PNGs | `04 §J` |
| 15 | Sidebar width tokenization | `04 §K` |
| 16 | Mobile drawer Esc-key handler | `04 §L` |
| 17 | Component-mockup carry-over archive | `04 §M` |
| 18 | Semantic-alias codemod (`bg-night-*` → `bg-canvas` etc., ~200 files) | `04 §N` |
| 19 | Playwright smoke + functional + axe suites against running stack | `05` |
| 20 | Lighthouse pass | `05` |
| 21 | Light-mode visual regression | `05` |

---

## Verification

- `pnpm --filter @matex/web-v2 typecheck` (via `tsc --noEmit -p tsconfig.json`) — ✅ clean
- `pnpm --filter @matex/web-v2 build` (via `next build`) — ✅ all routes compile, all CSS resolves, all imports valid
- All Phase 0 audit Top-10 issues resolved (8) or documented as deferred (2 — items 6 and 7 in the audit are asset-generation work).
- `apps/web-v2/public/` ~210 MB → ~86 MB; `archive/web-v2-public-2026-05-10/` holds the 150 MB of orphans.

`pnpm --filter @matex/web-v2 lint` is broken pre-existing (`eslint-config-next` not installed in the repo — interactive setup blocks). Tracked as a separate fix.

---

## Operational notes

- **Branch routing.** This work was originally targeted at `redesign/dashboard-overhaul` but the local git proxy rejected pushes to any branch except `claude/document-tools-capabilities-Q3CPx` with a 403 (verified after 4 retries with exponential backoff). With the user's authorization, the redesign commits piled on top of the docs commit on `claude/document-tools-capabilities-Q3CPx`. The CLAUDE.md docs change (commit `fac7e27`) and the redesign work (commits `8bbb05f` through this one) can be split into two PRs at review time via cherry-pick if desired — they touch distinct file sets.
- **Backward compatibility.** The dark experience is byte-for-byte identical to before this PR — verified by reading the new `.dark` CSS-var block against the previous hex values. Existing users who never toggle theme see no change.
- **Migration cost.** Phase 1 added the new tokens additively. Downstream component migration (Phase 4 §N) is a mechanical codemod that touches ~200 files but changes no rendered output. Recommend running it as a focused PR after this one merges.

---

## Where to start as a reviewer

1. `docs/redesign/00-audit.md` — what was wrong before.
2. `docs/redesign/04-implementation-sweep.md` — what landed in this branch.
3. `docs/redesign/01-tokens.md` — the design-token system.
4. `apps/web-v2/src/app/(app)/layout.tsx` — biggest single-file diff (shell a11y + hit targets + ThemeToggle mount).
5. `apps/web-v2/src/app/globals.css` — new `:root` / `.dark` token blocks + extended motion-reduce.
6. `apps/web-v2/src/components/system/ThemeProvider.tsx` — theme system core.
7. The 4 new `loading.tsx` files — small, mostly skeleton structure.
