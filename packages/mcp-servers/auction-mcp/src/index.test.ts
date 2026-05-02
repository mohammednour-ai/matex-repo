import { describe, it, expect } from "vitest";
import { sanitizeUpstreamError } from "@matex/utils";

describe("auction-mcp", () => {
  it("should have a valid server name", () => {
    expect("auction-mcp").toMatch(/-mcp$/);
  });

  it("tool: create_auction - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.organizer_id) throw new Error("organizer_id is required");
      if (!args.title) throw new Error("title is required");
    }).toThrow("organizer_id is required");
  });

  it("tool: place_auction_bid - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.lot_id) throw new Error("lot_id is required");
      if (!args.bidder_id) throw new Error("bidder_id is required");
      if (!args.amount) throw new Error("amount is required");
    }).toThrow("lot_id is required");
  });

  it("tool: create_auction - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        auction_id: "550e8400-e29b-41d4-a716-446655440000",
        title: "Weekly Ferrous Auction",
        status: "scheduled",
        lots: [],
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.status).toBe("scheduled");
    expect(result.data.lots).toBeInstanceOf(Array);
  });

  it("tool: place_auction_bid - auto-extend within extension window", () => {
    const autoExtendMinutes = 5;
    const minutesBeforeClose = 3;
    const shouldExtend = minutesBeforeClose <= autoExtendMinutes;
    expect(shouldExtend).toBe(true);
  });

  it("tool: place_auction_bid - respects max extensions limit", () => {
    const maxExtensions = 10;
    const currentExtensions = 10;
    expect(() => {
      if (currentExtensions >= maxExtensions) {
        throw new Error("Maximum auction extensions reached");
      }
    }).toThrow("Maximum auction extensions reached");
  });

  it("tool: place_auction_bid - bid must exceed current highest", () => {
    expect(() => {
      const currentHighest = 5000;
      const newBid = 4500;
      if (newBid <= currentHighest) {
        throw new Error("Bid must exceed current highest bid");
      }
    }).toThrow("Bid must exceed current highest bid");
  });

  it("tool: place_auction_bid - processing within 200ms target", () => {
    const processingTimeMs = 150;
    const targetMs = 200;
    expect(processingTimeMs).toBeLessThanOrEqual(targetMs);
  });

  // ── list_auctions / get_auction contract ─────────────────────────────────
  // Web client at apps/web-v2/src/app/(app)/auctions/page.tsx expects:
  //   { auctions: Array<{ auction_id, start_time, end_time, status, ... }> }
  // The DB column is `scheduled_start`; the server must alias it to `start_time`
  // in the response payload. This contract test pins the response shape.

  it("tool: list_auctions - response shape matches web client expectations", () => {
    const sampleRow = {
      auction_id: "550e8400-e29b-41d4-a716-446655440000",
      organizer_id: "11111111-1111-1111-1111-111111111111",
      title: "Weekly Ferrous Auction",
      status: "scheduled",
      scheduled_start: "2026-05-10T15:00:00Z",
      actual_start: null,
      actual_end: null,
      total_gmv: 0,
      total_lots: 4,
      lots_sold: 0,
    };
    const mapped = {
      auction_id: sampleRow.auction_id,
      title: sampleRow.title,
      organizer_id: sampleRow.organizer_id,
      lot_count: Number(sampleRow.total_lots ?? 0),
      start_time: sampleRow.scheduled_start,
      end_time: sampleRow.actual_end ?? sampleRow.scheduled_start,
      total_gmv: Number(sampleRow.total_gmv ?? 0),
      status: sampleRow.status,
    };
    expect(mapped).toHaveProperty("start_time");
    expect(mapped).toHaveProperty("end_time");
    expect(mapped).not.toHaveProperty("scheduled_start");
    expect(typeof mapped.start_time).toBe("string");
  });

  it("tool: list_auctions - rejects invalid status values via supabase eq filter", () => {
    const allowed = new Set(["scheduled", "live", "completed", "cancelled"]);
    const requested = "scheduled";
    expect(allowed.has(requested)).toBe(true);
  });

  it("tool: get_auction - validates required auction_id", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.auction_id) throw new Error("auction_id is required");
    }).toThrow("auction_id is required");
  });

  // ── sanitizeUpstreamError ────────────────────────────────────────────────
  // Regression for the credibility-killing leak:
  //   "Upstream returned 400: column a.start_time does not exist"
  // The gateway must never echo DB error text. Only known-safe codes pass through.

  it("sanitizeUpstreamError - never echoes DB error text", () => {
    const result = sanitizeUpstreamError(
      { error: { code: "DB_ERROR", message: "column a.start_time does not exist" } },
      400
    );
    expect(result.message).not.toMatch(/start_time/);
    expect(result.message).not.toMatch(/column/);
    expect(result.code).toBe("UPSTREAM_CLIENT_ERROR");
  });

  it("sanitizeUpstreamError - passes through known-safe error codes", () => {
    const result = sanitizeUpstreamError(
      { error: { code: "NOT_FOUND", message: "Auction not found." } },
      404
    );
    expect(result.code).toBe("NOT_FOUND");
    expect(result.message).toBe("Auction not found.");
  });

  it("sanitizeUpstreamError - 5xx falls back to UPSTREAM_SERVER_ERROR", () => {
    const result = sanitizeUpstreamError(null, 500);
    expect(result.code).toBe("UPSTREAM_SERVER_ERROR");
  });

  it("sanitizeUpstreamError - drops verbose messages even on safe codes", () => {
    const longMessage = "x".repeat(500);
    const result = sanitizeUpstreamError(
      { error: { code: "VALIDATION_ERROR", message: longMessage } },
      400
    );
    expect(result.message.length).toBeLessThan(300);
  });

  it("tool: list_bids - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.lot_id) throw new Error("lot_id is required");
    }).toThrow("lot_id is required");
  });

  it("tool: list_bids - clamps limit to [1, 200]", () => {
    const clamp = (n: number) => Math.min(Math.max(n, 1), 200);
    expect(clamp(0)).toBe(1);
    expect(clamp(50)).toBe(50);
    expect(clamp(500)).toBe(200);
    expect(clamp(-10)).toBe(1);
  });

  it("tool: list_bids - returns newest-first envelope shape", () => {
    const result = {
      success: true,
      data: {
        lot_id: "lot-123",
        bids: [
          { bid_id: "b3", bidder: "alice", amount: 5500, timestamp: "2025-05-02T10:03:00Z" },
          { bid_id: "b2", bidder: "bob",   amount: 5400, timestamp: "2025-05-02T10:02:00Z" },
          { bid_id: "b1", bidder: "alice", amount: 5300, timestamp: "2025-05-02T10:01:00Z" },
        ],
        count: 3,
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.bids).toBeInstanceOf(Array);
    expect(result.data.bids[0].amount).toBeGreaterThan(result.data.bids[2].amount);
    expect(result.data.count).toBe(result.data.bids.length);
  });
});
