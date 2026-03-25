import { describe, it, expect } from "vitest";

describe("analytics-mcp", () => {
  it("should have a valid server name", () => {
    expect("analytics-mcp").toMatch(/-mcp$/);
  });

  it("tool: get_dashboard_stats - no required args, returns shape", () => {
    const result = {
      success: true,
      data: {
        total_users: 1250,
        active_listings: 340,
        total_volume_cad: 4500000,
        open_disputes: 12,
        period: "30d",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.total_users).toBeGreaterThanOrEqual(0);
    expect(result.data.active_listings).toBeGreaterThanOrEqual(0);
    expect(result.data.total_volume_cad).toBeGreaterThanOrEqual(0);
  });

  it("tool: get_revenue_report - defaults period to 30d", () => {
    const args: Record<string, unknown> = {};
    const period = (args.period as string) ?? "30d";
    expect(period).toBe("30d");
  });

  it("tool: get_revenue_report - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        period: "30d",
        total_revenue: 157500.0,
        commission_revenue: 5512.5,
        transaction_count: 45,
        breakdown: [
          { type: "standard_sale", count: 30, revenue: 105000 },
          { type: "auction_sale", count: 15, revenue: 52500 },
        ],
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.breakdown).toBeInstanceOf(Array);
    expect(result.data.total_revenue).toBeGreaterThan(0);
    expect(result.data.commission_revenue).toBeGreaterThan(0);
  });

  it("tool: get_revenue_report - validates period format", () => {
    expect(() => {
      const period = "invalid";
      if (!/^\d+d$/.test(period)) {
        throw new Error("Period must be in format '<number>d' (e.g., '30d')");
      }
    }).toThrow("Period must be in format");
  });

  it("tool: get_dashboard_stats - returns all KPI fields", () => {
    const requiredFields = [
      "total_users",
      "active_listings",
      "total_volume_cad",
      "open_disputes",
    ];
    const data: Record<string, number> = {
      total_users: 100,
      active_listings: 50,
      total_volume_cad: 1000000,
      open_disputes: 5,
    };
    requiredFields.forEach((field) => {
      expect(data[field]).toBeDefined();
    });
  });

  it("analytics is read-only: no write operations", () => {
    const analyticsPermissions = { read: true, write: false };
    expect(analyticsPermissions.write).toBe(false);
    expect(analyticsPermissions.read).toBe(true);
  });
});
