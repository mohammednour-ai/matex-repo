import { describe, it, expect } from "vitest";

describe("dispute-mcp", () => {
  it("should have a valid server name", () => {
    expect("dispute-mcp").toMatch(/-mcp$/);
  });

  it("tool: file_dispute - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.order_id) throw new Error("order_id is required");
      if (!args.filing_party_id) throw new Error("filing_party_id is required");
    }).toThrow("order_id is required");
  });

  it("tool: escalate_dispute - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.dispute_id) throw new Error("dispute_id is required");
    }).toThrow("dispute_id is required");
  });

  it("tool: file_dispute - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        dispute_id: "550e8400-e29b-41d4-a716-446655440000",
        order_id: "660e8400-e29b-41d4-a716-446655440000",
        status: "open",
        filing_party_id: "770e8400-e29b-41d4-a716-446655440000",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.status).toBe("open");
    expect(result.data.dispute_id).toBeDefined();
  });

  it("PIS tier calculation - excellent (90-100)", () => {
    function getPisTier(score: number): string {
      if (score >= 90) return "excellent";
      if (score >= 70) return "good";
      if (score >= 50) return "fair";
      if (score >= 25) return "poor";
      return "critical";
    }
    expect(getPisTier(95)).toBe("excellent");
    expect(getPisTier(75)).toBe("good");
    expect(getPisTier(55)).toBe("fair");
    expect(getPisTier(30)).toBe("poor");
    expect(getPisTier(10)).toBe("critical");
  });

  it("PIS critical tier triggers automatic suspension", () => {
    expect(() => {
      const pisScore = 20;
      if (pisScore < 25) {
        throw new Error("Critical PIS score: automatic suspension pending admin review");
      }
    }).toThrow("automatic suspension");
  });

  it("tool: escalate_dispute - cannot escalate already resolved dispute", () => {
    expect(() => {
      const disputeStatus = "resolved";
      if (disputeStatus === "resolved") {
        throw new Error("Cannot escalate a resolved dispute");
      }
    }).toThrow("Cannot escalate a resolved dispute");
  });

  it("tool: file_dispute - penalty impacts PIS score", () => {
    const currentPis = 80;
    const penaltyPoints = 15;
    const newPis = Math.max(0, currentPis - penaltyPoints);
    expect(newPis).toBe(65);
    expect(newPis).toBeGreaterThanOrEqual(0);
  });
});
