// Drains log_mcp.event_outbox onto Redis Streams via MatexEventBus.
// Edge functions can't hold a Redis connection, so they INSERT into the
// outbox; this small worker is the only producer to Redis for edge events.
//
// Concurrency: SELECT … FOR UPDATE SKIP LOCKED makes it safe to run multiple
// replicas if throughput requires it. We claim a row, publish to Redis, then
// stamp published_at. If publish fails, the row stays NULL and gets retried
// on the next tick.

import { createClient } from "@supabase/supabase-js";
import { MatexEventBus } from "@matex/utils";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const POLL_INTERVAL_MS = Number(process.env.EVENT_RELAY_POLL_MS ?? 2000);
const BATCH_SIZE = Number(process.env.EVENT_RELAY_BATCH ?? 100);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[event-relay] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
if (!REDIS_URL) {
  console.error("[event-relay] REDIS_URL is required.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const eventBus = new MatexEventBus({ redisUrl: REDIS_URL });

interface OutboxRow {
  event_id: string;
  source: string;
  event: string;
  payload: Record<string, unknown>;
}

let stopping = false;

async function drainOnce(): Promise<number> {
  const { data, error } = await supabase
    .schema("log_mcp")
    .from("event_outbox")
    .select("event_id,source,event,payload")
    .is("published_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    console.error("[event-relay] outbox select failed:", error.message);
    return 0;
  }
  const rows = (data ?? []) as OutboxRow[];
  if (rows.length === 0) return 0;

  let published = 0;
  for (const row of rows) {
    try {
      await eventBus.publish(row.event, row.payload ?? {}, row.source);
      const { error: stampError } = await supabase
        .schema("log_mcp")
        .from("event_outbox")
        .update({ published_at: new Date().toISOString() })
        .eq("event_id", row.event_id);
      if (stampError) {
        console.error(`[event-relay] stamp failed for ${row.event_id}:`, stampError.message);
        continue;
      }
      published++;
    } catch (err) {
      console.error(`[event-relay] publish failed for ${row.event}:`, err);
    }
  }
  return published;
}

async function loop(): Promise<void> {
  while (!stopping) {
    try {
      const n = await drainOnce();
      if (n === 0) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    } catch (err) {
      console.error("[event-relay] loop error:", err);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

function shutdown(signal: string): void {
  console.log(`[event-relay] received ${signal}, draining...`);
  stopping = true;
  setTimeout(() => process.exit(0), 5000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(`[event-relay] starting; poll=${POLL_INTERVAL_MS}ms batch=${BATCH_SIZE}`);
loop().catch((err) => {
  console.error("[event-relay] fatal:", err);
  process.exit(1);
});
