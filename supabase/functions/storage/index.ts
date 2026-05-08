// Storage domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/storage-mcp/src/index.ts.

import { failEnvelope, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "storage-edge";
const DEFAULT_BUCKET = Deno.env.get("SUPABASE_STORAGE_BUCKET") ?? "matex-files";

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function generateSignedUploadUrl({ args }: ToolRequest) {
  const supabase = serviceClient();
  const path = String(args.path ?? "");
  if (!path) return failEnvelope("VALIDATION_ERROR", "Missing required 'path' argument.");
  const bucket = String(args.bucket ?? DEFAULT_BUCKET);
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return failEnvelope("STORAGE_ERROR", "Failed to generate upload URL");
  return okEnvelope({
    success: true,
    bucket,
    path,
    token: data.token,
    signed_url: data.signedUrl,
    file_hash_hint: await sha256Hex(path),
  });
}

async function generateSignedDownloadUrl({ args }: ToolRequest) {
  const supabase = serviceClient();
  const path = String(args.path ?? "");
  if (!path) return failEnvelope("VALIDATION_ERROR", "Missing required 'path' argument.");
  const bucket = String(args.bucket ?? DEFAULT_BUCKET);
  const expiresIn = typeof args.expires_in === "number" ? Math.max(60, Math.floor(args.expires_in)) : 60 * 30;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) return failEnvelope("STORAGE_ERROR", "Failed to generate download URL");
  return okEnvelope({
    success: true,
    bucket,
    path,
    expires_in: expiresIn,
    signed_url: data.signedUrl,
  });
}

Deno.serve(serveDomain({
  ping,
  generate_signed_upload_url: generateSignedUploadUrl,
  generate_signed_download_url: generateSignedDownloadUrl,
}));
