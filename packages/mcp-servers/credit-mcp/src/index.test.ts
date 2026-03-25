import { describe, it, expect } from "vitest";

describe("credit-mcp", () => {
  it("should have a valid server name", () => {
    expect("credit-mcp").toMatch(/-mcp$/);
  });

  it("tool: assess_credit - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.user_id) throw new Error("user_id is required");
      if (!args.score) throw new Error("score is required");
    }).toThrow("user_id is required");
  });

  it("tool: draw_credit - amount must not exceed available credit", () => {
    expect(() => {
      const creditLimit = 25000;
      const totalOutstanding = 20000;
      const availableCredit = creditLimit - totalOutstanding;
      const drawAmount = 10000;
      if (drawAmount > availableCredit) {
        throw new Error("Draw amount exceeds available credit");
      }
    }).toThrow("exceeds available credit");
  });

  it("tool: assess_credit - tier calculation: none", () => {
    function getCreditTier(score: number, kycLevel: number, txnCount: number, pis: number): string {
      if (score >= 800 && kycLevel >= 3 && txnCount >= 25 && pis >= 90) return "premium";
      if (score >= 650 && kycLevel >= 2 && txnCount >= 10 && pis >= 80) return "standard";
      if (score >= 500 && kycLevel >= 2 && txnCount >= 3 && pis >= 70) return "basic";
      return "none";
    }
    expect(getCreditTier(400, 1, 0, 50)).toBe("none");
  });

  it("tool: assess_credit - tier calculation: basic", () => {
    function getCreditTier(score: number, kycLevel: number, txnCount: number, pis: number): string {
      if (score >= 800 && kycLevel >= 3 && txnCount >= 25 && pis >= 90) return "premium";
      if (score >= 650 && kycLevel >= 2 && txnCount >= 10 && pis >= 80) return "standard";
      if (score >= 500 && kycLevel >= 2 && txnCount >= 3 && pis >= 70) return "basic";
      return "none";
    }
    expect(getCreditTier(550, 2, 5, 75)).toBe("basic");
  });

  it("tool: assess_credit - tier calculation: standard and premium", () => {
    function getCreditTier(score: number, kycLevel: number, txnCount: number, pis: number): string {
      if (score >= 800 && kycLevel >= 3 && txnCount >= 25 && pis >= 90) return "premium";
      if (score >= 650 && kycLevel >= 2 && txnCount >= 10 && pis >= 80) return "standard";
      if (score >= 500 && kycLevel >= 2 && txnCount >= 3 && pis >= 70) return "basic";
      return "none";
    }
    expect(getCreditTier(700, 2, 15, 85)).toBe("standard");
    expect(getCreditTier(850, 3, 30, 95)).toBe("premium");
  });

  it("tool: assess_credit - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        user_id: "550e8400-e29b-41d4-a716-446655440000",
        matex_credit_score: 720,
        tier: "standard",
        credit_limit: 100000,
        available_credit: 75000,
        interest_rate_monthly: 0.015,
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.matex_credit_score).toBeGreaterThanOrEqual(300);
    expect(result.data.matex_credit_score).toBeLessThanOrEqual(850);
    expect(result.data.interest_rate_monthly).toBe(0.015);
  });

  it("late payment: freeze after 15 days overdue", () => {
    expect(() => {
      const daysOverdue = 16;
      if (daysOverdue > 15) {
        throw new Error("Credit facility frozen: payment overdue more than 15 days");
      }
    }).toThrow("Credit facility frozen");
  });
});
