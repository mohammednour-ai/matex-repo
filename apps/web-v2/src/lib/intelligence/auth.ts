/**
 * Lightweight auth helpers for the intelligence API routes.
 *
 * The web app's MCP gateway is the real trust boundary; here we only need to
 * tie a request to a user_id so alerts and recommendations land in the right
 * row. We accept either:
 *   - `x-matex-user-id` header (set by the API client wrapper), or
 *   - a Bearer JWT whose payload contains `sub` / `user_id` (decoded without
 *     verifying — the gateway already validated it before the token reached
 *     localStorage).
 */

import type { NextRequest } from "next/server";

export function readUserId(req: NextRequest): string | null {
  const headerId = req.headers.get("x-matex-user-id")?.trim();
  if (headerId) return headerId;
  const auth = req.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return decodeJwtUserId(token);
}

function decodeJwtUserId(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { sub?: string; user_id?: string };
    return payload.user_id ?? payload.sub ?? null;
  } catch {
    return null;
  }
}
