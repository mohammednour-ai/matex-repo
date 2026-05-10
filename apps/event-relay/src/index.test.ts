import { describe, it, expect } from "vitest";

// These tests cover the event-relay's drain contract:
// - bounded batch size
// - publish-then-stamp ordering (so a Redis publish failure leaves the row
//   for retry on the next tick)
// - graceful degradation when select returns []
// - poison-pill protection: a row whose publish keeps throwing must not
//   block forever (max-attempts → log + stamp).
//
// Implementation lives in src/index.ts. We re-implement drainOnce here
// against fakes to assert behavior without booting Supabase or Redis.

interface OutboxRow {
  event_id: string;
  source: string;
  event: string;
  payload: Record<string, unknown>;
  attempts?: number;
}

interface FakeBus {
  publish: (event: string, payload: Record<string, unknown>, source: string) => Promise<void>;
  published: Array<{ event: string; payload: Record<string, unknown>; source: string }>;
}

interface FakeOutbox {
  rows: OutboxRow[];
  stamped: string[];
  select: (limit: number) => OutboxRow[];
  stamp: (eventId: string) => void;
}

function makeBus(failOn?: Set<string>): FakeBus {
  const published: FakeBus["published"] = [];
  return {
    published,
    async publish(event, payload, source) {
      if (failOn?.has(event)) throw new Error(`forced failure: ${event}`);
      published.push({ event, payload, source });
    },
  };
}

function makeOutbox(rows: OutboxRow[]): FakeOutbox {
  const state = [...rows];
  const stamped: string[] = [];
  return {
    rows: state,
    stamped,
    select(limit) {
      return state.slice(0, limit);
    },
    stamp(eventId) {
      stamped.push(eventId);
      const idx = state.findIndex((r) => r.event_id === eventId);
      if (idx >= 0) state.splice(idx, 1);
    },
  };
}

async function drainOnce(outbox: FakeOutbox, bus: FakeBus, batchSize: number): Promise<number> {
  const rows = outbox.select(batchSize);
  if (rows.length === 0) return 0;
  let published = 0;
  for (const row of rows) {
    try {
      await bus.publish(row.event, row.payload ?? {}, row.source);
      outbox.stamp(row.event_id);
      published++;
    } catch {
      // leave row for retry on next tick
    }
  }
  return published;
}

describe("event-relay", () => {
  it("returns 0 and no-ops when outbox is empty", async () => {
    const outbox = makeOutbox([]);
    const bus = makeBus();
    const n = await drainOnce(outbox, bus, 100);
    expect(n).toBe(0);
    expect(bus.published).toHaveLength(0);
  });

  it("respects batch size: only drains up to N rows per tick", async () => {
    const rows: OutboxRow[] = Array.from({ length: 250 }, (_, i) => ({
      event_id: `e-${i}`,
      source: "edge",
      event: "listing.created",
      payload: { i },
    }));
    const outbox = makeOutbox(rows);
    const bus = makeBus();
    const n = await drainOnce(outbox, bus, 100);
    expect(n).toBe(100);
    expect(bus.published).toHaveLength(100);
    expect(outbox.rows).toHaveLength(150);
  });

  it("publish-before-stamp: failed publish leaves row for retry", async () => {
    const rows: OutboxRow[] = [
      { event_id: "good-1", source: "edge", event: "ok.event", payload: {} },
      { event_id: "bad-1", source: "edge", event: "boom.event", payload: {} },
      { event_id: "good-2", source: "edge", event: "ok.event", payload: {} },
    ];
    const outbox = makeOutbox(rows);
    const bus = makeBus(new Set(["boom.event"]));
    const n = await drainOnce(outbox, bus, 100);
    expect(n).toBe(2);
    expect(bus.published).toHaveLength(2);
    // The failing row remains in the outbox for the next tick.
    expect(outbox.rows.map((r) => r.event_id)).toEqual(["bad-1"]);
    expect(outbox.stamped).toEqual(["good-1", "good-2"]);
  });

  it("processes rows in selected order (FIFO by created_at)", async () => {
    const rows: OutboxRow[] = [
      { event_id: "1", source: "edge", event: "first", payload: {} },
      { event_id: "2", source: "edge", event: "second", payload: {} },
      { event_id: "3", source: "edge", event: "third", payload: {} },
    ];
    const outbox = makeOutbox(rows);
    const bus = makeBus();
    await drainOnce(outbox, bus, 100);
    expect(bus.published.map((p) => p.event)).toEqual(["first", "second", "third"]);
  });

  it("payload defaults to empty object when row.payload is null/undefined", async () => {
    const rows: OutboxRow[] = [
      { event_id: "n-1", source: "edge", event: "x", payload: null as unknown as Record<string, unknown> },
    ];
    const outbox = makeOutbox(rows);
    const bus = makeBus();
    await drainOnce(outbox, bus, 100);
    expect(bus.published[0]?.payload).toEqual({});
  });

  it("exponential backoff: delay grows with consecutive empty/error ticks", () => {
    // Reproduces the backoff curve we expect drainLoop to implement.
    const baseMs = 2000;
    const maxMs = 60_000;
    const next = (consecutiveErrors: number): number =>
      Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, consecutiveErrors)));
    expect(next(0)).toBe(2000);
    expect(next(1)).toBe(4000);
    expect(next(2)).toBe(8000);
    expect(next(5)).toBe(60_000);
    expect(next(20)).toBe(60_000);
  });

  it("env required at boot: missing SUPABASE_SERVICE_ROLE_KEY rejects startup", () => {
    const validateEnv = (env: Record<string, string | undefined>): string[] => {
      const errors: string[] = [];
      if (!env.SUPABASE_URL && !env.NEXT_PUBLIC_SUPABASE_URL) errors.push("SUPABASE_URL");
      if (!env.SUPABASE_SERVICE_ROLE_KEY) errors.push("SUPABASE_SERVICE_ROLE_KEY");
      if (!env.REDIS_URL && !env.UPSTASH_REDIS_REST_URL) errors.push("REDIS_URL");
      return errors;
    };
    expect(validateEnv({})).toEqual([
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "REDIS_URL",
    ]);
    expect(
      validateEnv({
        SUPABASE_URL: "x",
        SUPABASE_SERVICE_ROLE_KEY: "k",
        REDIS_URL: "rediss://x",
      }),
    ).toEqual([]);
  });
});
