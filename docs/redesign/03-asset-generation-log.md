# Phase 3 — Asset generation log

This phase splits into **in-session wins** (executed) and **deferred** (documented for a follow-up session with image-processing tooling or design-team input).

---

## In-session wins (this commit)

### A. Dashboard OG watermark removal

`apps/web-v2/src/app/(app)/layout.tsx` ships a 1.1 MB JPG (`/grphs/Brand/og-social-share-image-b-og-share.jpg`) as a 7 % opacity watermark behind a radial mask on the dashboard route. The image data is invisible at that opacity — only the broad orange/steel tonality reads through. **Replaced** with an inline data-URI industrial-grain pattern (already present as `bg-industrial-grain` in `tailwind.config.js`) that themes via opacity adjustment.

Net: −1.1 MB on the dashboard route critical-path; one fewer asset request; dashboard loads identically by eye.

### B. Acknowledge the inline auth-guard gradient

`(app)/layout.tsx`'s `ClientAuthGuard` loader uses an inline `bg-[linear-gradient(165deg,#0e1116_0%,#15191f_42%,#1a1f27_100%)]` style. That hex-only gradient looks wrong on light mode (dark blocks float on a warm canvas). **Migrated** to use the same `var(--bg-app-canvas)` token that the post-auth canvas uses — themes automatically.

### C. Update root layout favicon path declaration

The current root `metadata.icons` entry wires the same `/favicon-512.png` (974 KB) at four sizes (32, 192, 512, 180). Even if the source file isn't replaced, the metadata can be cleaned up to declare a future-ready file set. **Deferred** — without image-processing tools we can't produce the resized sources in this session, and shipping the broken declaration first would cause 404s. Phase 4 follow-up.

---

## Deferred work (cannot land this session)

The deferred items each need a tool that isn't available in this sandbox (no `sharp`, no `ImageMagick`, no `ffmpeg`, no `svgo`, no Canva MCP design polish). Each is documented with a verbatim shell recipe so a follow-up session can run them quickly.

### D. Logo SVG (`logo-wordmark.svg`, `logo-mark.svg`)

Source: `archive/web-v2-public-2026-05-10/MatexLogo.png` (864 KB, 1024×1024). The logo is a complex composition (12-tooth gear + I-beam + node overlay + wordmark + tagline) — faithful re-creation by hand-written SVG paths is impractical.

**Recipe:** drive the Canva MCP `generate-design-structured` tool with the brief in `docs/design/IMAGE_GENERATION_PROMPTS.md` for `logo-wordmark` (industrial gear, brand orange `#e87722`, steel-gray secondary `#6b7385`, no shadows). Export as SVG, then run `svgo --multipass --pretty` to drop authoring metadata. Target file size ≤ 8 KB.

Reverse — generate `logo-mark.svg` (the gear + I-beam without the wordmark) at 64×64 viewBox.

### E. Favicon set

Once `logo-mark.svg` exists, generate the rasterized set with sharp:

```ts
// scripts/generate-favicons.ts
import sharp from "sharp";
import path from "path";
const src = path.join(__dirname, "../apps/web-v2/public/logo-mark.svg");
const out = path.join(__dirname, "../apps/web-v2/public");
const sizes = [16, 32, 48, 180, 192, 512];
for (const s of sizes) {
  await sharp(src)
    .resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: true })
    .toFile(`${out}/icon-${s}.png`);
}
```

Then update `app/layout.tsx` `metadata.icons` to reference the proper sizes. Replace the existing 974 KB `favicon-512.png` reference at multiple sizes with one entry per size.

### F. OG / Twitter image compression

Source: `apps/web-v2/public/grphs/Brand/og-social-share-image-b-og-share.jpg` (1.1 MB, 1200×630).

```bash
# mozjpeg path (preferred — best compression for photographic content)
cjpeg -quality 82 -progressive -optimize -outfile og-image.jpg \
  <(djpeg apps/web-v2/public/grphs/Brand/og-social-share-image-b-og-share.jpg)

# fallback: ImageMagick
magick apps/web-v2/public/grphs/Brand/og-social-share-image-b-og-share.jpg \
  -strip -quality 82 -interlace Plane apps/web-v2/public/og-image.jpg
```

Target: ≤ 200 KB. Move the original to archive after the metadata is updated.

For Twitter (1200×600 instead of 630):

```bash
magick og-image.jpg -resize 1200x600^ -gravity center -crop 1200x600+0+0 \
  +repage -strip -quality 82 -interlace Plane twitter-image.jpg
```

Target: ≤ 180 KB.

### G. Login video re-encode

Sources: `login-bg2.mp4` (32 MB), `login-bg3.mp4` (37 MB) — used in the auth/login background. Combined ~67 MB on the login route critical path.

```bash
# H.264 (universal compat, ~6 MB target)
ffmpeg -i apps/web-v2/public/login-bg2.mp4 \
  -c:v libx264 -preset slow -crf 28 -profile:v high -level 4.0 \
  -movflags +faststart -an -vf "scale=1920:1080:flags=lanczos,fps=24" \
  apps/web-v2/public/login-bg.mp4

# AV1 WebM (modern fallback, ~4 MB target)
ffmpeg -i apps/web-v2/public/login-bg2.mp4 \
  -c:v libsvtav1 -crf 35 -preset 8 -an -vf "scale=1920:1080:flags=lanczos,fps=24" \
  apps/web-v2/public/login-bg.webm

# Poster (for prefers-reduced-motion fallback)
ffmpeg -i apps/web-v2/public/login-bg2.mp4 -ss 00:00:02 -frames:v 1 \
  -q:v 4 apps/web-v2/public/login-poster.jpg
```

Then update `app/(auth)/login/page.tsx` to use a `<video>` with `<source>` for both formats and the poster, plus a `useReducedMotion()` hook fallback that skips `<video>` entirely when motion is reduced.

### H. Empty-state SVGs (12 + service-unavailable)

Drive Canva MCP `generate-design-structured` per slot. Reuse the style guide from `docs/design/IMAGE_GENERATION_PROMPTS.md`. Color palette restricted to:
- `#e87722` (brand-500)
- `#d4650f` (brand-600)
- `#2b313b` (night-700)
- `#8b92a0` (night-300)
- `#ffffff` (background)

Each design at viewBox 480×320, ≤ 12 KB after `svgo --multipass`. Output to `apps/web-v2/public/illustrations/empty/<slot>.svg`.

After landing, codemod `apps/web-v2/src/app/(app)/**/page.tsx` to point `EmptyState` `image` props at the new paths instead of `/grphs/Brand/empty-*.png`.

### I. Status illustrations (escrow / inspection / kyc / contract / bol / esign / shipment)

Same workflow as H. Output to `apps/web-v2/public/illustrations/status/<slot>.svg`. Currently the status pages render full-bleed status illustrations from `/illustrations/*.png` (which Phase 2 archived). Phase 4 sweep replaces the `<Image>` calls with `EmptyState`-style icon + heading + description cards (cheaper, more accessible) — the SVG illustrations become optional decorative supplements.

### J. Material thumbnails (re-export)

Source: `apps/web-v2/public/grphs/Materials/*.png` (18 files, ~6 MB total). Currently these are 1024×1024 PNG renders, displayed at 80–120 px in product cards.

```bash
# Pipeline
for f in apps/web-v2/public/grphs/Materials/*.png; do
  slug=$(basename "$f" .png | sed -E 's/-s-[a-z0-9]+$//' | tr '_' '-')
  out="apps/web-v2/public/materials/$slug"
  mkdir -p "$(dirname "$out")"
  sharp -i "$f" -o "$out.avif" --avif --quality 60 resize 240 240
  sharp -i "$f" -o "$out.webp" --webp --quality 70 resize 240 240
done
```

Target combined weight (all 18): ~250 KB. Codemod `apps/web-v2/src/lib/intelligence/materials.ts` to point at the new paths.

### K. `Platform Domains` PNG → Lucide migration

Replace 22 PNG references with the Lucide icons listed in `docs/redesign/02-asset-plan.md` § G. Pure code change in Phase 4 — no asset generation needed. After the migration, archive the 22 PNG files (saves ~1.5 MB and 22 asset requests).

### L. Avatar placeholder SVG

Replace `/grphs/Brand/avatar-placeholder-b-avatar.png` (40 KB) with an inline 96-viewBox SVG of a stylized industrial worker silhouette. Drive Canva MCP, `svgo --multipass`. Target ≤ 4 KB.

### M. Within-`grphs/` orphan cleanup

44 files inside `/grphs/` are unreferenced (per the audit). Phase 4 codemod identifies the final reference set after the Lucide migration completes, then archives those PNGs in one batch. Total cleanup ~5 MB.

---

## Acceptance criteria for Phase 3 (this session)

- [x] Dashboard OG watermark replaced with inline industrial-grain pattern.
- [x] Auth-guard loader gradient migrated to themed `--bg-app-canvas`.
- [x] Asset-generation recipes documented for the 11 deferred items (D–M).

Phase 4 sweep handles K (Lucide migration) and the remaining within-`grphs/` cleanup as part of normal codework.

---

## Addendum — Phase F follow-up (executed)

A second pass installed `sharp@^0.33` + `svgo@^3.3` as `web-v2` devDeps and ran the build pipeline at `apps/web-v2/scripts/build-assets.mjs`. ffmpeg-dependent items (login videos) and Canva-driven items (full empty-state illustrations) remain deferred. What did land:

| Item | Before | After |
|---|---|---|
| `avatar-placeholder.svg` | 40 KB PNG (`/grphs/Brand/avatar-placeholder-b-avatar.png`) | **276 B SVG** — hand-written silhouette, brand-orange |
| `logo-mark.svg` | did not exist (used `LogoOrangeTrns.png` 198 KB everywhere) | **291 B SVG** — simplified "M" mark on rounded brand-orange square |
| `logo-wordmark.svg` | did not exist | **813 B SVG** — mark + "MATEX" + tagline using Inter (loaded via `next/font`) |
| Favicon set | single 974 KB `favicon-512.png` referenced at 4 sizes (3.9 MB transfer waste) | **6 PNG files, 17.6 KB total** (16/32/48/180/192/512) |
| `og-image.jpg` | 1.1 MB JPG (`og-social-share-image-b-og-share.jpg`) | **61 KB JPG** — sharp + mozjpeg @ q82, 1200×630 |
| `twitter-image.jpg` | reused the 1.1 MB OG | **60 KB JPG** — separate twitter-card crop, 1200×600 |

**Net wire-saving across SEO/install discovery payload:** ~3.3 MB.

Code changes wiring the new assets:

- `apps/web-v2/src/app/layout.tsx` — `metadata.icons` lists 6 PNGs at their actual sizes plus the SVG mark for browsers that prefer vector. `metadata.openGraph.images[0].url` → `/og-image.jpg`. `metadata.twitter.images[0]` → `/twitter-image.jpg`.
- `apps/web-v2/src/app/(app)/settings/page.tsx` — avatar fallback `<img src>` → `/avatar-placeholder.svg`.

Newly-orphaned files moved to `archive/web-v2-public-2026-05-10/`:

- `apps/web-v2/public/favicon-512.png` (974 KB) — superseded by the 6-PNG set.
- `apps/web-v2/public/grphs/Brand/avatar-placeholder-b-avatar.png` (40 KB) — superseded by the SVG.

The pipeline script (`apps/web-v2/scripts/build-assets.mjs`) is committed and idempotent — re-run it after editing any source SVG to refresh the generated set.

### Still deferred from F

- **Logo wordmark fidelity** — the hand-written SVG is a clean simplified version (M-mark + "MATEX" + tagline). The original `LogoOrangeTrns.png` had a more ornate composition (gear + I-beam + node network + decorative wordmark). The sidebar continues to load `LogoOrangeTrns.png` so visual brand-fidelity is preserved until a designer reviews the simplified SVG and either approves or replaces it.
- **24 empty-state SVGs** — production-quality empty-state illustrations are an iterative design job. Recipe at §H queues this for a focused Canva-MCP-driven session.
- **11 status SVGs** — same.
- **18 material thumbnail re-exports** — sharp can do this now (the dep is installed). One follow-up sweep can knock these out per the §J recipe.
- **Login video re-encode** — still blocked on ffmpeg. No system access in this sandbox.
- **Avatar placeholder uses `currentColor`-friendly fixed brand orange** — for true theme reactivity (light + dark) the inline-svg-component pattern is needed. Acceptable for now since brand orange reads on both modes.
