#!/usr/bin/env node
/**
 * One-shot asset pipeline: svgo on the SVG sources, sharp for the favicon
 * set + OG/Twitter raster compression. Run with:
 *
 *   node apps/web-v2/scripts/build-assets.mjs
 *
 * Inputs are in `apps/web-v2/public/` and a few archived JPGs; outputs go
 * back to `public/`. Idempotent — safe to re-run after tweaking the source
 * SVG.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { optimize as svgoOptimize } from "svgo";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const ARCHIVE_OG = join(
  __dirname,
  "..",
  "..",
  "..",
  "archive",
  "web-v2-public-2026-05-10",
);

// ─── 1. Optimize SVGs ──────────────────────────────────────────────────────
const SVG_SOURCES = ["avatar-placeholder.svg", "logo-mark.svg", "logo-wordmark.svg"];

for (const name of SVG_SOURCES) {
  const path = join(PUBLIC_DIR, name);
  const before = await readFile(path, "utf8");
  const result = svgoOptimize(before, {
    multipass: true,
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            removeViewBox: false,
            // Keep aria-label and role for a11y.
            removeUnknownsAndDefaults: { keepRoleAttr: true, keepAriaAttrs: true },
          },
        },
      },
    ],
  });
  if (result.error) throw new Error(`svgo failed on ${name}: ${result.error}`);
  await writeFile(path, result.data);
  console.log(`svgo  ${name.padEnd(26)} ${before.length} → ${result.data.length} B`);
}

// ─── 2. Favicon set from logo-mark.svg ─────────────────────────────────────
// Sharp can rasterize SVG via librsvg/cairo. Output PNG with palette to keep
// each file <8 KB at the small sizes.
const LOGO_SVG = await readFile(join(PUBLIC_DIR, "logo-mark.svg"));
const FAVICON_SIZES = [
  { name: "icon-16.png", size: 16 },
  { name: "icon-32.png", size: 32 },
  { name: "icon-48.png", size: 48 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];

for (const { name, size } of FAVICON_SIZES) {
  const out = join(PUBLIC_DIR, name);
  const buf = await sharp(LOGO_SVG, { density: Math.max(72, size * 4) })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: size <= 64 })
    .toBuffer();
  await writeFile(out, buf);
  console.log(`png   ${name.padEnd(26)} ${size}×${size} ${buf.length} B`);
}

// ─── 3. OG / Twitter image compression ─────────────────────────────────────
// Source is the original 1.1 MB JPG that's still kept in /grphs/ for the
// real OG metadata. We re-export it through mozjpeg-like quality levels.
const OG_SOURCE = join(PUBLIC_DIR, "grphs", "Brand", "og-social-share-image-b-og-share.jpg");

try {
  const meta = await sharp(OG_SOURCE).metadata();
  console.log(`source og   ${meta.width}×${meta.height} ${meta.format}`);

  const ogBuf = await sharp(OG_SOURCE)
    .resize(1200, 630, { fit: "cover", position: "center" })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
  await writeFile(join(PUBLIC_DIR, "og-image.jpg"), ogBuf);
  console.log(`jpg   og-image.jpg            1200×630 ${ogBuf.length} B`);

  const twitterBuf = await sharp(OG_SOURCE)
    .resize(1200, 600, { fit: "cover", position: "center" })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
  await writeFile(join(PUBLIC_DIR, "twitter-image.jpg"), twitterBuf);
  console.log(`jpg   twitter-image.jpg       1200×600 ${twitterBuf.length} B`);
} catch (e) {
  console.warn(`OG compression skipped: ${e.message}`);
}

// ─── 4. Material thumbnails — resize in place 1024×1024 → 240×240 PNG ──────
// These render at 80–120 px in product cards; 240 px is 2× HiDPI safety.
// Re-saved as palette PNG for tiny weight; same path so no code changes.
import { readdir } from "node:fs/promises";
const MATERIALS_DIR = join(PUBLIC_DIR, "grphs", "Materials");
try {
  const files = (await readdir(MATERIALS_DIR)).filter((f) => f.endsWith(".png"));
  let totalBefore = 0;
  let totalAfter = 0;
  for (const name of files) {
    const path = join(MATERIALS_DIR, name);
    const before = (await sharp(path).metadata()).size ?? 0;
    const buf = await sharp(path)
      .resize(240, 240, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer();
    await writeFile(path, buf);
    totalBefore += before;
    totalAfter += buf.length;
    console.log(`mat   ${name.padEnd(36)} ${before} → ${buf.length} B`);
  }
  console.log(
    `materials total: ${(totalBefore / 1024).toFixed(0)} KB → ${(totalAfter / 1024).toFixed(0)} KB`,
  );
} catch (e) {
  console.warn(`Materials resize skipped: ${e.message}`);
}

console.log("\nDone.");
