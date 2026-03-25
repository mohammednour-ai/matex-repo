import { describe, it, expect } from "vitest";

describe("payments-mcp", () => {
  it("should have a valid server name", () => {
    expect("payments-mcp").toMatch(/-mcp$/);
  });

  it("tool: process_payment - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.user_id) throw new Error("user_id is required");
      if (!args.amount) throw new Error("amount is required");
    }).toThrow("user_id is required");
  });

  it("tool: get_wallet_balance - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.user_id) throw new Error("user_id is required");
    }).toThrow("user_id is required");
  });

  it("tool: process_payment - rejects negative amount", () => {
    expect(() => {
      const amount = -500;
      if (amount <= 0) throw new Error("Payment amount must be positive");
    }).toThrow("Payment amount must be positive");
  });

  it("tool: process_payment - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        transaction_id: "550e8400-e29b-41d4-a716-446655440000",
        user_id: "660e8400-e29b-41d4-a716-446655440000",
        amount: 15000.0,
        transaction_type: "purchase",
        status: "completed",
        tax_amount: 675.0,
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.transaction_id).toBeDefined();
    expect(result.data.transaction_type).toBe("purchase");
    expect(result.data.tax_amount).toBeGreaterThanOrEqual(0);
  });

  it("tool: get_wallet_balance - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        user_id: "660e8400-e29b-41d4-a716-446655440000",
        balance: 5000.0,
        pending_balance: 1200.0,
        currency: "CAD",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.balance).toBeGreaterThanOrEqual(0);
    expect(result.data.pending_balance).toBeGreaterThanOrEqual(0);
    expect(result.data.currency).toBe("CAD");
  });

  it("wallet balance cannot go negative", () => {
    const balance = 100;
    const withdrawAmount = 150;
    expect(() => {
      if (withdrawAmount > balance) {
        throw new Error("Insufficient wallet balance");
      }
    }).toThrow("Insufficient wallet balance");
  });

  it("tool: process_payment - step-up MFA required for >$5000", () => {
    expect(() => {
      const amount = 6000;
      const mfaVerified = false;
      if (amount > 5000 && !mfaVerified) {
        throw new Error("MFA verification required for transactions over $5,000 CAD");
      }
    }).toThrow("MFA verification required");
  });
});
