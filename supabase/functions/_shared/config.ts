// Read numeric values from log_mcp.platform_config with a fallback.
// Edge functions are short-lived; we don't bother caching across requests.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function getPlatformConfigNumber(
  supabase: SupabaseClient,
  configKey: string,
  fallback: number,
  validator?: (n: number) => boolean,
): Promise<number> {
  try {
    const { data } = await supabase
      .schema("log_mcp")
      .from("platform_config")
      .select("config_value")
      .eq("config_key", configKey)
      .maybeSingle();
    const value = data?.config_value;
    if (value !== undefined && value !== null) {
      const parsed = parseFloat(String(value));
      if (Number.isFinite(parsed) && (!validator || validator(parsed))) {
        return parsed;
      }
    }
  } catch {
    // fall through
  }
  return fallback;
}
