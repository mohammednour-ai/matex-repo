// Caller identity helpers. Edge functions deployed with verify_jwt=true have
// the JWT validated by the Supabase platform before our code runs; we still
// decode the payload to extract sub (user_id) without re-verifying.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { parsePlatformAdminRow } from "./logic.ts";

export interface Caller {
  userId: string;
  email: string | null;
  token: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getCaller(req: Request): Caller | null {
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const userId = typeof payload.sub === "string" ? payload.sub : "";
  if (!userId) return null;
  const email = typeof payload.email === "string" ? payload.email : null;
  return { userId, email, token };
}

export async function isPlatformAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase
    .schema("auth_mcp")
    .from("users")
    .select("is_platform_admin")
    .eq("user_id", userId)
    .maybeSingle();
  return parsePlatformAdminRow(data);
}
