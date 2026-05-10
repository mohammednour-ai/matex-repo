# Phase 2 — Asset Plan & Sizing Spec

Catalog of every visual slot in the redesigned dashboard, with format, size, dark-mode behavior, and source. Pairs with the orphan-disposition table for the public/ cleanup. Phase 3 generates assets per these specs; Phase 4 wires them in.

---

## Format priority

1. **SVG** — logos, marks, icon sets, decorative line-art, monochrome status illustrations. Inline where they need to inherit `currentColor` (theme-reactive); use `<Image>` or `<img src=*.svg>` otherwise.
2. **AVIF / WebP with PNG fallback** — full-color illustrations, hero photography. AVIF first, WebP second; Next.js `<Image>` does this for us.
3. **PNG** — only when AVIF/WebP can't represent it (e.g. animated frames as PNG sprite sheets).
4. **MP4 / WebM** — login-page video backgrounds only. Always `muted`, `playsInline`, `autoPlay` guarded by `prefers-reduced-motion: reduce` (a poster image is shown instead).

Naming: `<role>-<context>.<ext>` lowercase with hyphens. No vendor prefixes (`b-*`, `c-*`, `s-*`, `i-*`, `n-*`, `d-*`) — those came from a bulk-export tool and read as noise. Phase 4 renames as part of the migration.

Dimensions: every raster declares intrinsic `width` × `height` in the component. Layout never depends on natural-load size.

Theme: most illustrations are theme-stable (industrial steel + brand orange tones work on both light and dark). Where readability fails on one mode, ship a mode-pair with a `_light` / `_dark` suffix and switch via `next/image`'s `sizes`-style prop pattern (component decides via `useTheme().resolvedTheme`).

---

## Slot catalog

### A. Brand marks

| Slot | Format | Intrinsic | Rendered | Theme | Used in | Source |
|---|---|---|---|---|---|---|
| `logo-wordmark.svg` | SVG | viewBox 320×110 | 64–224 px tall | stable (orange + neutral) | sidebar (collapsed/expanded), login | Canva MCP — re-export current PNG to SVG |
| `logo-mark.svg` | SVG | viewBox 64×64 | 32–64 px (favicon master, app shell collapsed) | stable | favicon source, mobile collapsed | Canva MCP |
| `logo-wordmark-mono.svg` | SVG | viewBox 320×110 | (reserved) | mono — inherits `currentColor` | future use (footer, emails) | Canva MCP |

### B. Favicons (generated from `logo-mark.svg`)

| Slot | Size | Format | Used by |
|---|---|---|---|
| `favicon.ico` | 32 × 32 | ICO | legacy browser tab |
| `icon-16.png` | 16 | PNG | tab |
| `icon-32.png` | 32 | PNG | tab |
| `icon-192.png` | 192 | PNG | PWA / Android |
| `icon-512.png` | 512 | PNG | PWA splash |
| `apple-touch-icon.png` | 180 | PNG | iOS home screen |

Replaces the current single 974 KB `favicon-512.png` referenced at four sizes. Each new file ≤ 8 KB (tiny because the source is vector).

### C. OG / social

| Slot | Size | Format | Target weight | Used by |
|---|---|---|---|---|
| `og-image.jpg` | 1200 × 630 | JPG q82 | ≤ 200 KB | `<meta property="og:image">` in root layout |
| `twitter-image.jpg` | 1200 × 600 | JPG q82 | ≤ 180 KB | `<meta name="twitter:image">` |

Replaces the current 1.1 MB `og-social-share-image-b-og-share.jpg`. Generated from the wordmark + factory-skyline hero, optimized via mozjpeg.

### D. Empty-state illustrations (component slot)

The redesigned `EmptyState` keeps a single hero illustration per route. Each is **decorative** (`alt=""` + `aria-hidden`), so theme-fragile illustrations are acceptable — the title + body carry meaning.

| Slot | Used by | Format | Intrinsic | Rendered |
|---|---|---|---|---|
| `empty-listings.svg` | `listings/` | SVG | 480×320 | 280×186 (md) |
| `empty-search.svg` | `search/` | SVG | 480×320 | 280×186 |
| `empty-messages.svg` | `messages/`, `chat/` | SVG | 480×320 | 280×186 |
| `empty-notifications.svg` | `notifications/` | SVG | 480×320 | 280×186 |
| `empty-auctions.svg` | `auctions/` | SVG | 480×320 | 280×186 |
| `empty-inspections.svg` | `inspections/` | SVG | 480×320 | 280×186 |
| `empty-contracts.svg` | `contracts/` | SVG | 480×320 | 280×186 |
| `empty-escrow.svg` | `escrow/` | SVG | 480×320 | 280×186 |
| `empty-checkout.svg` | `checkout/` | SVG | 480×320 | 280×186 |
| `empty-logistics.svg` | `logistics/` | SVG | 480×320 | 280×186 |
| `empty-admin.svg` | `admin/` | SVG | 480×320 | 280×186 |
| `empty-activity-feed.svg` | dashboard activity panel | SVG | 360×220 | 240×147 (sm) |
| `service-unavailable.svg` | `(app)/error.tsx` | SVG | 480×320 | 280×186 |

Each ≤ 12 KB SVG (limited palette: brand-500, brand-600, night-700, night-300, white). Source: Canva MCP `generate-design-structured` with style guide per illustration.

**Migration:** existing `/grphs/Brand/empty-*.png` files are reused for now in the EmptyState; replaced incrementally as new SVGs land. Phase 4 codemod points to the new paths.

### E. Status illustrations

Status pages currently overload icon + colored badge. The redesign replaces full-page status illustrations with **icon + heading + description** patterns (lighter weight, easier to localize). Six existing illustrations move to status-specific helper visuals on the matching page:

| Slot | Format | Intrinsic | Used in |
|---|---|---|---|
| `escrow-held.svg` | SVG | 360×240 | escrow detail "funds held" state |
| `escrow-released.svg` | SVG | 360×240 | escrow "funds released" success card |
| `escrow-frozen.svg` | SVG | 360×240 | escrow "frozen" warning card |
| `inspection-pass.svg` | SVG | 360×240 | inspection result card |
| `inspection-fail.svg` | SVG | 360×240 | inspection result card |
| `inspection-pending.svg` | SVG | 360×240 | inspection in-progress card |
| `kyc-level-{0,1,2,3}.svg` | SVG | 320×200 | KYC level summary in settings |
| `contract-active.svg` | SVG | 360×240 | contracts list active card |
| `bol-generated.svg` | SVG | 360×240 | logistics BOL panel |
| `esign-sent.svg` | SVG | 360×240 | contracts esign sent card |
| `shipment-tracking.svg` | SVG | 360×240 | logistics tracker |

Each ≤ 14 KB SVG. Source: Canva MCP from prompt template. Currently the project has these as 1 MB+ PNGs in `/illustrations/` (orphan, never wired).

### F. Material category icons

Every active material listing uses one of 13 PNG renders (`/grphs/Materials/*.png`, ~250 KB–760 KB each, ~6 MB total). These are **photographic-style 3D renders** that read as illustrations on a card thumbnail.

**Decision:** keep as raster (the 3D rendering style is part of the brand) but re-export as **AVIF + WebP at appropriate render sizes** (currently they're ~1024 px squares but rendered at 80–120 px in cards):

| Slot family | Format | Intrinsic | Rendered | Per-file weight |
|---|---|---|---|---|
| `materials/<slug>.avif` | AVIF q60 | 240×240 (2× of largest render) | 80–120 px | ≤ 12 KB |
| `materials/<slug>.webp` | WebP q70 | 240×240 | (fallback) | ≤ 18 KB |

Slugs: `aluminum-6063`, `aluminum-extrusion`, `copper-wire`, `copper-bare-bright`, `e-waste`, `ferrous-shred`, `hms-1-2`, `paper-cardboard`, `plastics`, `rebar`, `rubber`, `scrap-pile`, `sheet-metal`, `stainless-304`, `steel-coil`, `steel-i-beam`, `steel-pipes`, `surplus-equipment`. (18 total.)

Total weight after re-export: ~250 KB (vs. current ~6 MB referenced + ~6 MB orphans in `/icons/categories/`).

### G. Platform-domain glyphs

`/grphs/Platform Domains/*.png` (22 files, ~1.5 MB) — used as small inline icons on dashboard quick-action cards and tiles. **Decision:** replace with the existing Lucide icon set (`Package`, `Search`, `Gavel`, `Shield`, `Truck`, `Calendar`, `FileText`, `Settings`, `BarChart3`, `LineChart`, `UserCog`, etc.) — already imported in `(app)/layout.tsx`. Saves ~1.5 MB and gives us crisp `currentColor` icons that theme automatically.

Phase 4 sweep maps each `domain-*.png` reference to its Lucide equivalent. Migration map:

| Current PNG | Lucide replacement |
|---|---|
| `admin-d-admin.png` | `UserCog` |
| `analytics-d-analytics.png` | `BarChart3` |
| `auction-d-auction.png` | `Gavel` |
| `booking-d-booking.png` | `Calendar` |
| `contracts-d-contracts.png` | `FileText` |
| `credit-d-credit.png` | `CreditCard` |
| `dispute-d-dispute.png` | `AlertOctagon` |
| `escrow-d-escrow.png` | `Shield` |
| `esign-d-esign.png` | `PenTool` |
| `inspection-d-inspection.png` | `ClipboardCheck` |
| `kyc-d-kyc.png` | `BadgeCheck` |
| `listing-d-listing.png` | `Package` |
| `logistics-d-logistics.png` | `Truck` |
| `messaging-d-messaging.png` | `MessageSquare` |
| `notifications-d-notifications.png` | `Bell` |
| `payments-d-payments.png` | `Wallet` |
| `pricing-d-pricing.png` | `TrendingUp` |
| `profile-d-profile.png` | `User` |
| `search-d-search.png` | `Search` |
| `tax-d-tax.png` | `Receipt` |

### H. Hero / login backgrounds

| Slot | Format | Size | Notes |
|---|---|---|---|
| `login-bg.mp4` | MP4 H.264 | 1920×1080 @ 24 fps, ~4 Mbps | Re-encode of current `login-bg2.mp4` (32 MB → ~6 MB target). Muted, autoplay, motion-reduced fallback to poster. |
| `login-bg.webm` | WebM AV1 | same | Modern fallback |
| `login-poster.jpg` | JPG q80 | 1920×1080, ≤ 250 KB | Shown when motion-reduced or video can't load |

Replaces both `login-bg2.mp4` (32 MB) and `login-bg3.mp4` (37 MB). The `xx`-suffixed variants (`login-bg2xx.mp4`, `login-bg3xx.mp4`, ~60 MB combined) are confirmed orphans and move to archive.

### I. Decorative dashboard watermark

The dashboard `(app)/layout.tsx` overlays `/grphs/Brand/og-social-share-image-b-og-share.jpg` (1.1 MB JPG) at 7 % opacity behind a radial mask. **Decision:** replace with an inline SVG `industrial-grain` pattern (already defined in tailwind config under `backgroundImage`). Saves the entire 1.1 MB load; no visible delta because the watermark is ≤ 7 %.

### J. Avatar placeholder

| Slot | Format | Intrinsic | Rendered |
|---|---|---|---|
| `avatar-placeholder.svg` | SVG | 96×96 | 32–64 px |

Replaces `/grphs/Brand/avatar-placeholder-b-avatar.png` (40 KB). Inline so it inherits theme colors.

---

## Sizing standards

- **Icon set (Lucide):** `size={16}` (caption inline), `size={18}` (default UI), `size={20}` (mobile menu trigger), `size={24}` (page header). Always passed via JS prop, never CSS sized.
- **Empty-state illustrations:** rendered at 240–280 px wide, intrinsic 480×320 (≈ 1.7× safety for HiDPI). `<Image>` `sizes="280px"`.
- **Hero photography (none in Phase 1 redesign):** if introduced, intrinsic 2560 × 1440 with `sizes="(min-width: 1024px) 60vw, 100vw"`.
- **Material thumbnails:** intrinsic 240×240, rendered up to 120 px. `sizes="120px"`.
- **Logo:** SVG; CSS sets height, width auto.

All `<Image>` calls must declare either `fill` + `sizes`, or `width` + `height`. AGENTS.md rule.

---

## Dark-mode behavior

| Asset class | Light mode | Dark mode |
|---|---|---|
| SVG icons (Lucide) | `currentColor` (inherits text color) | same — ✓ |
| SVG illustrations (custom) | brand-500 + brand-600 + night-700 stroke + white fill | brand-500 + brand-400 + night-700 stroke + night-100 fill (mode pair) |
| Material thumbnails (raster) | unchanged (3D renders read fine on both modes) | unchanged ✓ |
| Empty-state SVGs | designed once with both modes in mind; legibility verified at QA | same ✓ |
| Login video | unchanged (full-bleed, no theme dependency) | unchanged ✓ |

The dashboard OG watermark is removed in Phase 4 (replaced with CSS pattern), so it has no theme concern.

---

## Orphan disposition (move to `archive/web-v2-public-2026-05-10/`)

Following the Phase 1.6 audit precedent, these go to `archive/` rather than being deleted. Total ~150 MB freed from the Vercel CDN.

### Whole directories

| Path | Size | Files | Why |
|---|---|---|---|
| `apps/web-v2/public/grphs2/` | ~28 MB | 88 | Byte-identical duplicate of `/grphs/`; zero references |
| `apps/web-v2/public/illustrations/` | ~36 MB | 30 | Never imported; superseded by Phase 3 SVG illustration plan |
| `apps/web-v2/public/hero-features/` | ~7.5 MB | 6 | Never imported; landing-page heroes from a removed page |
| `apps/web-v2/public/icons/categories/` | ~7.9 MB | 8 | Never imported; PNG icons that should always have been SVG |

### Individual files

| Path | Size | Why |
|---|---|---|
| `MatexLogo.png` | 864 KB | Orphan; superseded by `LogoOrangeTrns.png` (active) and Phase 3 SVG |
| `LogoOrange.png` | 1.2 MB | Orphan |
| `MatexLogox.png` | 234 KB | Orphan |
| `dashadv.png` | 1.4 MB | Orphan; same image also exists as `dashadv.jpg` |
| `dashadv.jpg` | 567 KB | Orphan |
| `login-bg.png` | 2 MB | Orphan (login uses .mp4 variants) |
| `login-bg2xx.mp4` | 30 MB | Orphan dup of `login-bg2.mp4` |
| `login-bg3xx.mp4` | 30 MB | Orphan dup of `login-bg3.mp4` |
| `LOADING.mp4` | 1.1 MB | Orphan |

### Within `grphs/` (Phase 4 sweep — leave for now)

44 of 88 files in `/grphs/` are unreferenced (`auction-completed`, `auction-live`, `auction-lot`, `auction-upcoming`, `auction-gavel`, `matex-gear-mark`, `filter`, `search`, `verified-seller-ca`, `fe-shred`, `rebar-bundle`, `sheet-metal-stack`, `steel-pipes`, `surplus-equipment`, `notification-bell`, 8 platform-domain PNGs, plus ~24 others). Total ~5 MB. Disposition: leave in place this phase — Phase 4 codemod will identify the final reference set after the Lucide migration and `Platform Domains/` cleanup, then archive in one batch.

---

## Generation plan

| Asset | Source | Phase |
|---|---|---|
| Logo SVG (`logo-wordmark.svg`, `logo-mark.svg`) | Canva MCP `generate-design-structured` from `LogoOrangeTrns.png` brief | Phase 3 |
| Favicon set | Sharp/svgo pipeline from `logo-mark.svg` | Phase 3 |
| OG / Twitter image | Canva MCP composition (logo + factory hero) → mozjpeg | Phase 3 |
| Empty-state SVGs (12 + service-unavailable) | Canva MCP per `docs/design/IMAGE_GENERATION_PROMPTS.md` style guide | Phase 3 |
| Status SVGs (escrow/inspection/kyc/contract/etc.) | Canva MCP | Phase 3 |
| Material thumbnails (re-export) | Sharp pipeline on existing 1024 px PNGs → 240 px AVIF + WebP | Phase 3 |
| Industrial-grain pattern | already inline data-URI in tailwind config | done |

Each generated asset gets a row in `apps/web-v2/public/illustrations/MANIFEST.json` (new) listing source brief, license/credit, and last-regenerated timestamp.

---

## Acceptance criteria for Phase 2

- [ ] `docs/redesign/02-asset-plan.md` (this file) committed.
- [ ] `archive/web-v2-public-2026-05-10/` directory created and orphan files moved (4 directories + 9 individual files).
- [ ] No new references to archived paths in `apps/web-v2/src/`.
- [ ] `pnpm dev:web-v2-stack` still boots; the dashboard renders without 404s on assets.
- [ ] The Phase 1 acceptance criteria still hold (theme toggle works, dark experience identical).

Phase 3 generates the new assets per this spec.
