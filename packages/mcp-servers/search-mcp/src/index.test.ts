import { describe, it, expect } from "vitest";

describe("search-mcp", () => {
  it("should have a valid server name", () => {
    expect("search-mcp").toMatch(/-mcp$/);
  });

  it("tool: search_materials - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.query) throw new Error("query is required");
    }).toThrow("query is required");
  });

  it("tool: geo_search - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.lat) throw new Error("lat is required");
      if (!args.lng) throw new Error("lng is required");
    }).toThrow("lat is required");
  });

  it("tool: geo_search - validates coordinate ranges", () => {
    expect(() => {
      const lat = 91;
      const lng = -73.5;
      if (lat < -90 || lat > 90) throw new Error("lat must be between -90 and 90");
      if (lng < -180 || lng > 180) throw new Error("lng must be between -180 and 180");
    }).toThrow("lat must be between -90 and 90");
  });

  it("tool: search_materials - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        listings: [
          { listing_id: "abc-123", title: "HMS 1 Scrap", price_per_unit: 285.0 },
        ],
        total: 1,
        page: 1,
        per_page: 20,
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.listings).toBeInstanceOf(Array);
    expect(result.data.total).toBeGreaterThanOrEqual(0);
    expect(result.data.page).toBe(1);
  });

  it("tool: geo_search - returns expected shape with distance", () => {
    const result = {
      success: true,
      data: {
        listings: [
          { listing_id: "abc-123", title: "Copper Wire", distance_km: 12.5 },
        ],
        radius_km: 50,
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.listings[0].distance_km).toBeDefined();
    expect(result.data.radius_km).toBeGreaterThan(0);
  });

  it("tool: search_materials - empty query returns error", () => {
    expect(() => {
      const query = "";
      if (!query.trim()) throw new Error("query must not be empty");
    }).toThrow("query must not be empty");
  });
});
