// Drains log_mcp.event_outbox onto Redis Streams via MatexEventBus.
// Edge functions can't hold a Redis connection, so they INSERT into the
// outbox; this small worker is the only producer to Redis for edge events.
//
// Concurrency: this implementation uses plain supabase-js SELECT, which does
// NOT lock the row. Run a single replica until the SQL claim path lands
// (would require either an `attempts/claimed_at` migration or an RPC that
// performs `SELECT … FOR UPDATE SKIP LOCKED` and returns claimed rows).
// Publish-then-stamp ordering means a Redis publish failure leaves
// published_at NULL and the row is retried on the next tick.
//
// Resilience:
// - Bounded batch per tick (EVENT_RELAY_BATCH).
// - Exponential backoff on consecutive errors (2s → 60s cap).
// - Poison-pill protection: a row that fails MAX_PUBLISH_ATTEMPTS times in
//   the same process is logged and stamped to prevent the loop spinning on
//   it forever. Counter is in-memory and resets on restart.

import { createClient } from "@supabase/supabase-js";
import { MatexEventBus } from "@matex/utils";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const POLL_INTERVAL_MS = Number(process.env.EVENT_RELAY_POLL_MS ?? 2000);
const BATCH_SIZE = Number(process.env.EVENT_RELAY_BATCH ?? 100);
const BACKOFF_MAX_MS = Number(process.env.EVENT_RELAY_BACKOFF_MAX_MS ?? 60_000);
const MAX_PUBLISH_ATTEMPTS = Number(process.env.EVENT_RELAY_MAX_ATTEMPTS ?? 5);

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
const publishAttempts = new Map<string, number>();

async function stampPublished(eventId: string): Promise<boolean> {
  const { error } = await supabase
    .schema("log_mcp")
    .from("event_outbox")
    .update({ published_at: new Date().toISOString() })
    .eq("event_id", eventId);
  if (error) {
    console.error(`[event-relay] stamp failed for ${eventId}:`, error.message);
    return false;
  }
  return true;
}

async function drainOnce(): Promise<number> {
  const { data, error } = await supabase
    .schema("log_mcp")
    .from("event_outbox")
    .select("event_id,source,event,payload")
    .is("published_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    throw new Error(`outbox select failed: ${error.message}`);
  }
  const rows = (data ?? []) as OutboxRow[];
  if (rows.length === 0) return 0;

  let published = 0;
  for (const row of rows) {
    try {
      await eventBus.publish(row.event, row.payload ?? {}, row.source);
      const stamped = await stampPublished(row.event_id);
      if (stamped) {
        publishAttempts.delete(row.event_id);
        published++;
      }
    } catch (err) {
      const attempts = (publishAttempts.get(row.event_id) ?? 0) + 1;
      publishAttempts.set(row.event_id, attempts);
      const reason = err instanceof Error ? err.message : String(err);
      if (attempts >= MAX_PUBLISH_ATTEMPTS) {
        console.error(
          `[event-relay] poison row ${row.event_id} (${row.event}) after ${attempts} attempts: ${reason}; stamping to skip.`,
        );
        // Stamp so the loop stops spinning on it. Downstream consumers must
        // be idempotent; an alert on this log line is the recovery signal.
        await stampPublished(row.event_id);
        publishAttempts.delete(row.event_id);
      } else {
        console.error(
          `[event-relay] publish failed for ${row.event} (${row.event_id}, attempt ${attempts}/${MAX_PUBLISH_ATTEMPTS}): ${reason}`,
        );
      }
    }
  }
  return published;
}

function backoffMs(consecutiveErrors: number): number {
  if (consecutiveErrors <= 0) return POLL_INTERVAL_MS;
  return Math.min(BACKOFF_MAX_MS, POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors));
}

async function loop(): Promise<void> {
  let consecutiveErrors = 0;
  while (!stopping) {
    try {
      const n = await drainOnce();
      consecutiveErrors = 0;
      if (n === 0) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    } catch (err) {
      consecutiveErrors++;
      const wait = backoffMs(consecutiveErrors);
      console.error(
        `[event-relay] loop error (${consecutiveErrors} in a row, sleeping ${wait}ms):`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, wait));
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

console.log(
  `[event-relay] starting; poll=${POLL_INTERVAL_MS}ms batch=${BATCH_SIZE} maxAttempts=${MAX_PUBLISH_ATTEMPTS} backoffMax=${BACKOFF_MAX_MS}ms`,
);
loop().catch((err) => {
  console.error("[event-relay] fatal:", err);
  process.exit(1);
});
