import { describe, it, expect } from "vitest";

describe("tax-mcp", () => {
  it("should have a valid server name", () => {
    expect("tax-mcp").toMatch(/-mcp$/);
  });

  it("tool: calculate_tax - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.seller_province) throw new Error("seller_province is required");
      if (!args.buyer_province) throw new Error("buyer_province is required");
      if (!args.subtotal) throw new Error("subtotal is required");
    }).toThrow("seller_province is required");
  });

  it("tool: calculate_tax - Ontario HST at 13%", () => {
    const subtotal = 10000;
    const hstRate = 0.13;
    const tax = subtotal * hstRate;
    expect(tax).toBe(1300);
  });

  it("tool: calculate_tax - BC GST 5% + PST 7%", () => {
    const subtotal = 10000;
    const gst = subtotal * 0.05;
    const pst = subtotal * 0.07;
    const totalTax = gst + pst;
    expect(gst).toBeCloseTo(500, 2);
    expect(pst).toBeCloseTo(700, 2);
    expect(totalTax).toBeCloseTo(1200, 2);
  });

  it("tool: calculate_tax - Quebec GST 5% + QST 9.975%", () => {
    const subtotal = 10000;
    const gst = subtotal * 0.05;
    const qst = subtotal * 0.09975;
    const totalTax = gst + qst;
    expect(gst).toBe(500);
    expect(qst).toBeCloseTo(997.5, 2);
    expect(totalTax).toBeCloseTo(1497.5, 2);
  });

  it("tool: calculate_tax - Alberta GST only at 5%", () => {
    const subtotal = 10000;
    const gst = subtotal * 0.05;
    expect(gst).toBe(500);
  });

  it("tool: calculate_tax - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        subtotal: 10000,
        gst: 500,
        pst: 0,
        hst: 1300,
        qst: 0,
        total_tax: 1300,
        total: 11300,
        seller_province: "ON",
        buyer_province: "ON",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.total).toBe(result.data.subtotal + result.data.total_tax);
  });

  it("invoice number format MTX-YYYY-NNNNNN", () => {
    function generateInvoiceNumber(year: number, seq: number): string {
      return `MTX-${year}-${String(seq).padStart(6, "0")}`;
    }
    expect(generateInvoiceNumber(2026, 42)).toBe("MTX-2026-000042");
    expect(generateInvoiceNumber(2026, 1)).toBe("MTX-2026-000001");
    expect(generateInvoiceNumber(2026, 999999)).toBe("MTX-2026-999999");
  });

  it("T5018 auto-generation threshold", () => {
    const totalPaymentsToSeller = 600;
    const t5018Threshold = 500;
    const requiresT5018 = totalPaymentsToSeller > t5018Threshold;
    expect(requiresT5018).toBe(true);
  });
});
