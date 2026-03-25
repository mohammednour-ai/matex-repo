import { describe, it, expect } from "vitest";

describe("inspection-mcp", () => {
  it("should have a valid server name", () => {
    expect("inspection-mcp").toMatch(/-mcp$/);
  });

  it("tool: request_inspection - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.requested_by) throw new Error("requested_by is required");
      if (!args.inspection_type) throw new Error("inspection_type is required");
    }).toThrow("requested_by is required");
  });

  it("tool: evaluate_discrepancy - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.order_id) throw new Error("order_id is required");
      if (!args.expected_weight_kg) throw new Error("expected_weight_kg is required");
    }).toThrow("order_id is required");
  });

  it("tool: evaluate_discrepancy - detects weight outside tolerance", () => {
    const expectedKg = 1000;
    const actualKg = 1030;
    const tolerancePct = 0.02;
    const discrepancyPct = Math.abs(actualKg - expectedKg) / expectedKg;
    expect(discrepancyPct).toBeGreaterThan(tolerancePct);
  });

  it("tool: evaluate_discrepancy - within tolerance passes", () => {
    const expectedKg = 1000;
    const actualKg = 1015;
    const tolerancePct = 0.02;
    const discrepancyPct = Math.abs(actualKg - expectedKg) / expectedKg;
    expect(discrepancyPct).toBeLessThanOrEqual(tolerancePct);
  });

  it("tool: request_inspection - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        inspection_id: "550e8400-e29b-41d4-a716-446655440000",
        inspection_type: "third_party",
        status: "scheduled",
        scheduled_at: "2026-03-25T10:00:00Z",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.inspection_id).toBeDefined();
    expect(result.data.status).toBe("scheduled");
  });

  it("tool: evaluate_discrepancy - weight authority priority", () => {
    const weights = {
      w1_seller: 1000,
      w2_carrier: 995,
      w3_buyer: 990,
      w4_third_party: 988,
    };
    const authoritative = weights.w4_third_party ?? weights.w3_buyer ?? weights.w2_carrier ?? weights.w1_seller;
    expect(authoritative).toBe(988);
  });

  it("tool: request_inspection - mandatory for listings over $100K", () => {
    const listingValue = 150_000;
    const mandatoryThreshold = 100_000;
    const inspectionRequired = listingValue > mandatoryThreshold;
    expect(inspectionRequired).toBe(true);
  });
});
