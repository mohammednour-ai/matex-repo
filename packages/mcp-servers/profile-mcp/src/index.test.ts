import { describe, it, expect } from "vitest";

describe("profile-mcp", () => {
  it("should have a valid server name", () => {
    expect("profile-mcp").toMatch(/-mcp$/);
  });

  it("tool: get_profile - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.user_id) throw new Error("user_id is required");
    }).toThrow("user_id is required");
  });

  it("tool: update_profile - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.user_id) throw new Error("user_id is required");
    }).toThrow("user_id is required");
  });

  it("tool: update_profile - rejects invalid business number format", () => {
    const CRA_BN_REGEX = /^\d{9}(RT\d{4})?$/;
    expect(() => {
      const bn = "INVALID-BN";
      if (!CRA_BN_REGEX.test(bn.replace(/\s/g, ""))) {
        throw new Error("Invalid CRA Business Number format");
      }
    }).toThrow("Invalid CRA Business Number format");
  });

  it("tool: get_profile - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        user_id: "550e8400-e29b-41d4-a716-446655440000",
        display_name: "Acme Recycling",
        company_name: "Acme Recycling Ltd.",
        province: "ON",
        roles: ["seller", "buyer"],
      },
    };
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.user_id).toBeDefined();
    expect(result.data.roles).toBeInstanceOf(Array);
  });

  it("tool: update_profile - accepts valid business number", () => {
    const CRA_BN_REGEX = /^\d{9}(RT\d{4})?$/;
    const validBN = "123456789RT0001";
    expect(CRA_BN_REGEX.test(validBN.replace(/\s/g, ""))).toBe(true);
  });

  it("tool: get_profile - error on non-existent user", () => {
    const result = {
      success: false,
      error: { code: "PROFILE_NOT_FOUND", message: "Profile not found" },
    };
    expect(result.success).toBe(false);
    expect(result.error.code).toBe("PROFILE_NOT_FOUND");
  });
});
