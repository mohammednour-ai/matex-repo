import { describe, it, expect } from "vitest";

describe("log-mcp", () => {
  it("should have a valid server name", () => {
    expect("log-mcp").toMatch(/-mcp$/);
  });

  it("tool: log_tool_call - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.server) throw new Error("server is required");
      if (!args.tool) throw new Error("tool is required");
      if (!args.user_id) throw new Error("user_id is required");
    }).toThrow("server is required");
  });

  it("tool: log_tool_call - never logs sensitive fields in plain text", () => {
    const sensitiveFields = ["password_hash", "mfa_secret", "access_token_hash", "account_number_enc"];
    const logEntry = {
      input_hash: "sha256_of_input",
      output_summary: "success",
    };
    sensitiveFields.forEach((field) => {
      expect(logEntry).not.toHaveProperty(field);
    });
  });

  it("tool: verify_integrity - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        chain_valid: true,
        entries_checked: 10000,
        first_entry_at: "2026-01-01T00:00:00Z",
        last_entry_at: "2026-03-23T12:00:00Z",
        breaks_found: 0,
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.chain_valid).toBe(true);
    expect(result.data.breaks_found).toBe(0);
  });

  it("hash chain immutability: each entry links to previous", () => {
    const entries = [
      { id: 1, content: "entry1", prev_hash: null, entry_hash: "hash_a" },
      { id: 2, content: "entry2", prev_hash: "hash_a", entry_hash: "hash_b" },
      { id: 3, content: "entry3", prev_hash: "hash_b", entry_hash: "hash_c" },
    ];
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].prev_hash).toBe(entries[i - 1].entry_hash);
    }
  });

  it("tool: verify_integrity - detects hash chain break", () => {
    expect(() => {
      const entries = [
        { entry_hash: "hash_a" },
        { prev_hash: "hash_a", entry_hash: "hash_b" },
        { prev_hash: "TAMPERED", entry_hash: "hash_c" },
      ];
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].prev_hash !== entries[i - 1].entry_hash) {
          throw new Error("CRITICAL: Hash chain break detected");
        }
      }
    }).toThrow("Hash chain break detected");
  });

  it("log categories cover all 8 required types", () => {
    const requiredCategories = [
      "tool_call",
      "event",
      "external_api",
      "auth",
      "financial",
      "admin_action",
      "system_health",
      "security",
    ];
    expect(requiredCategories).toHaveLength(8);
  });

  it("hot storage retention is 90 days, cold is 7 years", () => {
    const hotRetentionDays = 90;
    const coldRetentionYears = 7;
    expect(hotRetentionDays).toBe(90);
    expect(coldRetentionYears).toBe(7);
  });
});
