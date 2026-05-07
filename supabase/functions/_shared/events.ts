// Edge functions cannot hold a Redis connection, so we INSERT into
// log_mcp.event_outbox and a small Node relay worker drains it onto Redis
// Streams (where the rest of the system already listens).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { generateId } from "./logic.ts";

export async function emitEvent(
  supabase: SupabaseClient,
  source: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.schema("log_mcp").from("event_outbox").insert({
    event_id: generateId(),
    source,
    event,
    payload,
  });
  if (error) {
    // Non-blocking: log but never fail the tool call because the outbox is down.
    console.error(`[events] outbox insert failed for ${event}:`, error.message);
  }
}
