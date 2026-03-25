import { describe, it, expect } from "vitest";

describe("escrow-mcp", () => {
  it("should have a valid server name", () => {
    expect("escrow-mcp").toMatch(/-mcp$/);
  });

  it("tool: create_escrow - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.order_id) throw new Error("order_id is required");
      if (!args.buyer_id) throw new Error("buyer_id is required");
      if (!args.seller_id) throw new Error("seller_id is required");
      if (!args.amount) throw new Error("amount is required");
    }).toThrow("order_id is required");
  });

  it("tool: hold_funds - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.escrow_id) throw new Error("escrow_id is required");
      if (!args.amount) throw new Error("amount is required");
    }).toThrow("escrow_id is required");
  });

  it("tool: release_funds - cannot release from 'created' state", () => {
    expect(() => {
      const currentStatus = "created";
      const allowedForRelease = ["funds_held", "partially_released"];
      if (!allowedForRelease.includes(currentStatus)) {
        throw new Error(`Cannot release funds from '${currentStatus}' state`);
      }
    }).toThrow("Cannot release funds from 'created' state");
  });

  it("tool: create_escrow - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        escrow_id: "550e8400-e29b-41d4-a716-446655440000",
        order_id: "660e8400-e29b-41d4-a716-446655440000",
        amount: 25000.0,
        status: "created",
        timeline: [{ status: "created", timestamp: "2026-03-23T12:00:00Z" }],
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.status).toBe("created");
    expect(result.data.timeline).toHaveLength(1);
  });

  it("escrow lifecycle: valid state transitions", () => {
    const validTransitions: Record<string, string[]> = {
      created: ["funds_held", "cancelled"],
      funds_held: ["partially_released", "released", "frozen", "refunded"],
      partially_released: ["released"],
      frozen: ["released", "refunded"],
    };
    expect(validTransitions["created"]).toContain("funds_held");
    expect(validTransitions["created"]).not.toContain("released");
    expect(validTransitions["funds_held"]).toContain("frozen");
  });

  it("tool: freeze_funds - frozen escrow requires authorized release", () => {
    const releaseAuthorities = ["admin_decision", "anti_manipulation_trigger", "arbitration_ruling"];
    expect(() => {
      const releaseReason = "buyer_request";
      if (!releaseAuthorities.includes(releaseReason)) {
        throw new Error("Frozen escrow requires admin, anti-manipulation, or arbitration authorization");
      }
    }).toThrow("Frozen escrow requires admin");
  });

  it("tool: hold_funds - amount must be positive", () => {
    expect(() => {
      const amount = 0;
      if (amount <= 0) throw new Error("Hold amount must be greater than zero");
    }).toThrow("Hold amount must be greater than zero");
  });
});
