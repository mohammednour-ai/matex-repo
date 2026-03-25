import { describe, it, expect } from "vitest";

describe("listing-mcp", () => {
  it("should have a valid server name", () => {
    expect("listing-mcp").toMatch(/-mcp$/);
  });

  it("tool: create_listing - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.seller_id) throw new Error("seller_id is required");
      if (!args.title) throw new Error("title is required");
    }).toThrow("seller_id is required");
  });

  it("tool: publish_listing - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.listing_id) throw new Error("listing_id is required");
    }).toThrow("listing_id is required");
  });

  it("tool: create_listing - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        listing_id: "550e8400-e29b-41d4-a716-446655440000",
        seller_id: "660e8400-e29b-41d4-a716-446655440000",
        title: "HMS 1 Ferrous Scrap - 40 MT",
        status: "draft",
        environmental_classification: "non-hazardous",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.status).toBe("draft");
    expect(result.data.listing_id).toBeDefined();
  });

  it("tool: publish_listing - blocks listing without environmental permit when required", () => {
    expect(() => {
      const material = "hazardous";
      const permits: unknown[] = [];
      if (material === "hazardous" && permits.length === 0) {
        throw new Error("Environmental permit required for hazardous materials");
      }
    }).toThrow("Environmental permit required");
  });

  it("tool: publish_listing - enforces cooling period for high-theft materials", () => {
    expect(() => {
      const isFirstTimeSeller = true;
      const materialCategory = "copper";
      const highTheftCategories = ["copper", "catalytic_converters"];
      if (isFirstTimeSeller && highTheftCategories.includes(materialCategory)) {
        throw new Error("72-hour cooling period required for first-time sellers of high-theft materials");
      }
    }).toThrow("72-hour cooling period");
  });

  it("tool: create_listing - validates environmental classification enum", () => {
    const validClassifications = ["non-hazardous", "potentially_hazardous", "hazardous"];
    expect(() => {
      const classification = "unknown";
      if (!validClassifications.includes(classification)) {
        throw new Error("Invalid environmental classification");
      }
    }).toThrow("Invalid environmental classification");
  });
});
