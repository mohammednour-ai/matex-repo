# YardOps UI Audit — 2026-05-10

**App:** `apps/yardops` (Matex YardOps)
**Reference:** `apps/web-v2` (Matex Exchange Hub)
**Target:** WCAG 2.2 AA · Light + Dark mode parity · Industrial/utilitarian personality

---

## Top 10 Issues

### 1. Dark-only UI — no light mode
`globals.css` defines only dark-palette CSS variables. `tailwind.config.js` does not include `darkMode: 'class'`. All pages render identically in OS light and dark mode — there is no `data-theme="light"` branch, no `light:` utility prefix, and no toggle.

**Impact:** Users forced into dark mode; breaks WCAG 1.4.3 in bright outdoor environments (scrap yards).
**Fix:** Add `darkMode: 'class'` to Tailwind config + define semantic CSS variables in `:root` (light) and `.dark` (dark).

---

### 2. No brand assets in `yardops/public/`
The `apps/yardops/public/` directory was empty. No logo, no favicon, no open-graph image, no manifest. The sidebar renders plain text "Matex YardOps" with no visual identity.

**Impact:** Looks unfinished; no tab icon; PWA install is broken.
**Fix:** Copy brand assets from `apps/web-v2/public/` (MatexLogo.png, LogoOrange.png, gear-mark.png, factory-hero.png). Generate `favicon.ico` + `manifest.webmanifest`. *(Assets already copied to `apps/yardops/public/images/` in this session.)*

---

### 3. No Inter font imported
`globals.css` references `font-family: 'Inter', ...` (via Tailwind `sans` stack) but Inter is never imported via `<link>` in `layout.tsx` or `@import` in CSS. Browsers fall back to system-ui, causing a FOUT/layout shift.

**Impact:** Typography inconsistency vs. web-v2; first-paint layout shift.
**Fix:** Add `next/font/google` Inter import in `apps/yardops/src/app/layout.tsx`.

---

### 4. No favicon or web app manifest
`apps/yardops/src/app/layout.tsx` metadata block has `title`/`description` but no `icons`, no `manifest`, no `themeColor`. The browser tab shows the generic globe icon.

**Impact:** Yard tablets using "Add to Home Screen" get no icon; PWA install broken.
**Fix:** Add `favicon.ico` to `public/`, reference in `layout.tsx` metadata `icons` field.

---

### 5. Sidebar logo is plain text — no image
`apps/yardops/src/app/(app)/layout.tsx` renders:
```tsx
<span className="text-xl font-bold text-brand-400">Matex YardOps</span>
```
No `<Image>` or logo SVG is used.

**Impact:** No visual brand identity; inconsistent with web-v2's logo treatment.
**Fix:** Replace text span with `<Image src="/images/LogoOrange.png" …>` + keep text label for screen readers.

---

### 6. Empty states use only icons — no illustrations
All list pages (Sellers, Lots, Cat Converters, Audit, Reports) show a Lucide icon + "No X found" text when empty. web-v2 uses branded illustrations.

**Impact:** App feels unpolished on first launch before any data exists.
**Fix:** Add one neutral "empty yard" illustration (Canva MCP or SVG) reused across list pages with context-specific captions.

---

### 7. Sub-minimum hit targets (WCAG 2.5.8)
Two interactive controls fall below 44×44 px:
- Sidebar collapse toggle: `p-1.5` on an icon button ≈ 28×28 px
- Modal close buttons (`×`): `p-1` ≈ 24×24 px

On a touchscreen tablet used by yard workers wearing gloves, these are effectively unusable.

**Impact:** WCAG 2.5.8 failure; high misclick rate on tablets.
**Fix:** Change to `p-3` (48×48 px) with `min-w-[44px] min-h-[44px]` guard.

---

### 8. Root font-size not set
`apps/yardops/globals.css` has no `html { font-size: ... }`. web-v2 sets `html { font-size: 80%; }` as a base scale (10rem = 12.8 px). YardOps inherits browser default 16 px, creating subtle spacing and sizing drift if any rem-based values are shared.

**Impact:** Minor cross-app consistency issue; will compound if shared component tokens are introduced.
**Fix:** Set `html { font-size: 80%; }` in globals.css (matching web-v2).

---

### 9. `text-[10px]` in MaterialGrid — below legibility minimum
`MaterialGrid.tsx` uses `text-[10px]` for material category labels inside the grid tiles. 10 px is below the 12 px soft minimum for body text and will be illegible in outdoor bright-sunlight conditions.

**Impact:** Poor legibility for yard scale operators.
**Fix:** Replace `text-[10px]` with `text-xs` (12 px) minimum.

---

### 10. No skip-to-content keyboard shortcut
No `<a href="#main-content">Skip to main content</a>` link exists in any layout. Keyboard users must tab through the full sidebar navigation on every page.

**Impact:** WCAG 2.4.1 bypass blocks failure.
**Fix:** Add visually-hidden skip link as first focusable element in `(app)/layout.tsx`.

---

## Secondary Observations

| Issue | Location | Severity |
|---|---|---|
| No `<html lang="en">` attribute | `layout.tsx` | Medium (WCAG 3.1.1) |
| Sidebar nav links lack active-state `aria-current="page"` | `(app)/layout.tsx` | Medium |
| `<canvas>` in SignaturePad has no `aria-label` | `SignaturePad.tsx` | Medium |
| Error boundaries not present on any page | All pages | Low |
| No `prefers-reduced-motion` guard on animations | globals.css | Low |

---

## Reference Comparisons

| Feature | web-v2 | yardops | Gap |
|---|---|---|---|
| Light/dark mode | ✅ `darkMode: 'class'` + CSS vars | ❌ Dark only | Major |
| Font import | ✅ `next/font/google` | ❌ Missing | Major |
| Brand logo in nav | ✅ MatexLogo.png | ❌ Text only | Major |
| Favicon + manifest | ✅ | ❌ | Major |
| Skip link | ❌ (also missing) | ❌ | Medium |
| ARIA labels on nav | ✅ most present | ⚠️ partial | Medium |
| Empty-state illustrations | ✅ | ❌ | Minor |

---

## Proposed Phase 1 Scope (tokens + foundation)

Changes that unblock everything else:

1. `tailwind.config.js` — add `darkMode: 'class'`, verify color tokens match web-v2 palette
2. `globals.css` — add `:root` (light) + `.dark` semantic CSS variable blocks, `html { font-size: 80% }`, Inter font import, skip-link style, `prefers-reduced-motion`
3. `layout.tsx` (root) — Inter font, favicon metadata, `<html lang="en">`
4. `(app)/layout.tsx` — skip-to-content link, logo `<Image>`, sidebar hit target fixes, `aria-current="page"` on active nav link
5. `MaterialGrid.tsx` — `text-[10px]` → `text-xs`

**Estimated effort:** ~2 hours, zero functional regressions.
