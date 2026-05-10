import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export const db = supabase ? supabase.schema("yardops_mcp") : null;

export function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, data });
}

export function fail(
  code: string,
  message: string,
): { isError: true; content: Array<{ type: "text"; text: string }> } {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ success: false, error: { code, message } }) }],
  };
}
