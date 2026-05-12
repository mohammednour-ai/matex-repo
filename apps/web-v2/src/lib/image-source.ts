/**
 * Helpers for user-uploaded image URLs.
 *
 * Listing photos and avatars are stored in Supabase Storage and addressed
 * with public URLs from the `NEXT_PUBLIC_SUPABASE_URL` host (or, in legacy
 * data, any `*.supabase.co` host). We allow those in `next.config.mjs`'s
 * `images.remotePatterns` so `<Image>` can optimize them.
 *
 * A small slice of legacy listings still reference photos on third-party
 * hosts that aren't allow-listed. Calling `<Image src={...}>` with one of
 * those URLs throws at runtime; falling back to a plain `<img>` keeps the
 * page rendering. `isOptimizableImage` returns true only for URLs whose
 * host matches a `remotePatterns` entry below — keep this in sync with
 * `next.config.mjs`.
 */

const ALLOWED_HOST_SUFFIXES = [".supabase.co"];

/** Returns true if `<Image>` can render `url` (host matches remotePatterns). */
export function isOptimizableImage(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    // Relative URLs and data: URIs fall through to the unoptimized path.
    return false;
  }
}
