import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

/**
 * POST /api/upload — server-side proxy for listing image uploads.
 *
 * Why this exists:
 *   The adapter's `listing.upload_images` (in mcp-http-adapter) was returning
 *   a direct Supabase Storage PUT URL plus the service-role key as a Bearer
 *   header for the browser to use. Two problems:
 *     1. Exposes the service-role key in the browser's network log.
 *     2. Supabase Storage's PUT endpoint rejects the new `sb_secret_*` key
 *        format with "Invalid Compact JWS" — it only accepts legacy
 *        JWT-format service-role keys.
 *
 *   The `@supabase/supabase-js` SDK knows how to authenticate the new key
 *   format for storage operations, so we route uploads through Node.
 *
 * Request:
 *   multipart/form-data
 *     - file: File         (required)
 *     - listing_id: string (required)
 *
 * Response (success): { public_url, path, listing_id }
 * Response (error):   { error: string }  with HTTP 4xx/5xx
 */

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024; // matches the bucket's file_size_limit
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(req: NextRequest) {
  // Auth: must have the session cookie. Middleware already verifies it for
  // page routes, but /api/* is exempt — re-check here.
  const session = req.cookies.get("matex_session");
  if (!session?.value) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json(
      { error: "Server storage credentials not configured" },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = form.get("file");
  const listingId = String(form.get("listing_id") ?? "").trim();
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!listingId) {
    return NextResponse.json({ error: "Missing listing_id" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `Unsupported content type: ${contentType}` },
      { status: 415 },
    );
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const fileId = randomUUID();
  const safeName = (file.name || "image.jpg").replace(/[/\\]/g, "_");
  const path = `listings/${listingId}/${fileId}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await sb.storage
    .from("listing-images")
    .upload(path, bytes, { contentType, upsert: false });
  if (upErr) {
    return NextResponse.json(
      { error: upErr.message || "Storage upload failed" },
      { status: 500 },
    );
  }

  const { data: pub } = sb.storage.from("listing-images").getPublicUrl(path);
  return NextResponse.json({
    public_url: pub.publicUrl,
    path,
    listing_id: listingId,
  });
}
