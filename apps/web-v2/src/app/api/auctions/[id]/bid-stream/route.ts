import { NextRequest } from "next/server";
import Redis from "ioredis";
import { verifyMatexJwt } from "@/lib/jwt-edge";

/**
 * Server-Sent Events bid stream (P1-7b).
 *
 * Subscribes to the matex.events Redis stream and forwards
 * `bidding.bid.placed` events whose payload.auction_id matches the route
 * param to the browser. Each connected client gets its own XREAD cursor so
 * we don't need consumer groups — losing a message on disconnect is
 * acceptable because the client falls back to polling auction.list_bids
 * for catch-up.
 *
 * Auth: matex_session cookie is validated by the middleware before this
 * route runs; we trust it here.
 *
 * Runtime: nodejs. ioredis pulls in net.Socket which Edge Runtime doesn't
 * expose. The SSE stream stays open for the duration of the client
 * connection; Vercel's default request timeout (60s on hobby, 300s on pro)
 * applies — the client reconnects with EventSource's built-in retry.
 *
 * Refs: docs/audit/2026-05-10/p1-p2-plan.md (P1-7b).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STREAM_NAME = "matex.events";
const TARGET_EVENT = "bidding.bid.placed";
const HEARTBEAT_MS = 15_000;
const READ_BLOCK_MS = 5_000;

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const auctionId = ctx.params.id;
  if (!auctionId) return new Response("auction_id is required", { status: 400 });

  // Self-authenticate. The middleware exempts /api/* (other than /api/auth)
  // so this route handles its own auth check. EventSource always sends
  // cookies, so the HttpOnly matex_session cookie is available here.
  const token = req.cookies.get("matex_session")?.value ?? "";
  const claims = token ? await verifyMatexJwt(token) : null;
  if (!claims) {
    return new Response("unauthorized", { status: 401 });
  }

  const redisUrl = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  if (!redisUrl) {
    return new Response("redis_not_configured", { status: 503 });
  }

  const encoder = new TextEncoder();
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

  let cursor = "$"; // "$" = only new entries arriving after subscribe
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(payload: string): void {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller may be closed if the client disconnected between
          // ticks — swallow and let the cleanup branch run.
          closed = true;
        }
      }

      send(`event: hello\ndata: ${JSON.stringify({ auction_id: auctionId })}\n\n`);
      heartbeat = setInterval(() => {
        // Comment line keeps the connection alive through proxies that
        // drop idle HTTP streams. EventSource ignores comment lines.
        send(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      try {
        await redis.connect();
      } catch (e) {
        send(
          `event: error\ndata: ${JSON.stringify({
            message: e instanceof Error ? e.message : "redis_connect_failed",
          })}\n\n`,
        );
        controller.close();
        closed = true;
        return;
      }

      void (async () => {
        while (!closed) {
          try {
            // BLOCK pauses the connection on the Redis side so we don't
            // burn CPU spinning. Each XREAD returns whatever arrived
            // since the previous cursor; we update cursor to the last id.
            // ioredis types XREAD with stricter literal ordering than the
            // wire protocol; cast via callRaw for COUNT+BLOCK+STREAMS.
            const result = (await (
              redis as unknown as { call: (...a: unknown[]) => Promise<unknown> }
            ).call(
              "XREAD",
              "COUNT",
              "20",
              "BLOCK",
              String(READ_BLOCK_MS),
              "STREAMS",
              STREAM_NAME,
              cursor,
            )) as Array<[string, Array<[string, string[]]>]> | null;

            if (!result || result.length === 0) continue;
            const entries = result[0]?.[1] ?? [];
            for (const [id, fields] of entries) {
              cursor = id;
              const eventNameIdx = fields.indexOf("event");
              const payloadIdx = fields.indexOf("payload");
              const eventName = eventNameIdx >= 0 ? fields[eventNameIdx + 1] : "";
              if (eventName !== TARGET_EVENT) continue;
              let payload: Record<string, unknown> = {};
              if (payloadIdx >= 0) {
                try { payload = JSON.parse(fields[payloadIdx + 1] ?? "{}"); } catch { continue; }
              }
              if (String(payload.auction_id ?? "") !== auctionId) continue;
              send(`event: bid\ndata: ${JSON.stringify(payload)}\n\n`);
            }
          } catch (e) {
            if (closed) break;
            // Transient connection / blocking-read errors: surface once
            // and back off briefly. EventSource clients retry on close
            // automatically.
            send(
              `event: error\ndata: ${JSON.stringify({
                message: e instanceof Error ? e.message : "stream_error",
              })}\n\n`,
            );
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      })();

      // Client disconnect — clean up.
      req.signal.addEventListener("abort", () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        void redis.quit().catch(() => {});
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      void redis.quit().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
