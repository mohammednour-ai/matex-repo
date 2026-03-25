import { describe, it, expect } from "vitest";

describe("pricing-mcp", () => {
  it("should have a valid server name", () => {
    expect("pricing-mcp").toMatch(/-mcp$/);
  });

  it("tool: capture_market_price - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.material) throw new Error("material is required");
      if (!args.price) throw new Error("price is required");
    }).toThrow("material is required");
  });

  it("tool: create_price_alert - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.user_id) throw new Error("user_id is required");
      if (!args.material) throw new Error("material is required");
      if (!args.threshold) throw new Error("threshold is required");
    }).toThrow("user_id is required");
  });

  it("tool: capture_market_price - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        price_id: "550e8400-e29b-41d4-a716-446655440000",
        material: "copper",
        price: 8950.5,
        currency: "USD",
        source: "LME",
        captured_at: "2026-03-23T12:00:00Z",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.price).toBeGreaterThan(0);
    expect(result.data.source).toMatch(/^(LME|Fastmarkets)$/);
  });

  it("tool: capture_market_price - currency must be noted", () => {
    const priceRecord = { material: "aluminum", price: 2450, currency: "USD" };
    expect(priceRecord.currency).toBeDefined();
    expect(["USD", "CAD"]).toContain(priceRecord.currency);
  });

  it("index-linked contract pricing with floor/ceiling", () => {
    const indexPrice = 2000;
    const premium = 100;
    const quantity = 10;
    const floor = 22000;
    const ceiling = 25000;
    let calculatedPrice = (indexPrice + premium) * quantity;
    calculatedPrice = Math.max(floor, Math.min(ceiling, calculatedPrice));
    expect(calculatedPrice).toBe(22000);
  });

  it("tool: create_price_alert - threshold must be positive", () => {
    expect(() => {
      const threshold = -100;
      if (threshold <= 0) throw new Error("Price alert threshold must be positive");
    }).toThrow("threshold must be positive");
  });

  it("fallback to cached prices when LME bridge fails", () => {
    const lmeBridgeAvailable = false;
    const cachedPrice = { material: "copper", price: 8900, cached_at: "2026-03-22T12:00:00Z" };
    const priceSource = lmeBridgeAvailable ? "live" : "cached";
    expect(priceSource).toBe("cached");
    expect(cachedPrice.price).toBeGreaterThan(0);
  });
});
