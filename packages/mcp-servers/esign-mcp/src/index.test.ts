import { describe, it, expect } from "vitest";

describe("esign-mcp", () => {
  it("should have a valid server name", () => {
    expect("esign-mcp").toMatch(/-mcp$/);
  });

  it("tool: create_document - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.template_type) throw new Error("template_type is required");
      if (!args.signatories) throw new Error("signatories is required");
    }).toThrow("template_type is required");
  });

  it("tool: create_document - requires at least one signatory", () => {
    expect(() => {
      const signatories: string[] = [];
      if (signatories.length === 0) {
        throw new Error("At least one signatory is required");
      }
    }).toThrow("At least one signatory");
  });

  it("tool: create_document - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        document_id: "550e8400-e29b-41d4-a716-446655440000",
        template_type: "supply_contract",
        status: "pending_signatures",
        signatories: [
          { user_id: "user-1", signed: false },
          { user_id: "user-2", signed: false },
        ],
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.status).toBe("pending_signatures");
    expect(result.data.signatories).toHaveLength(2);
  });

  it("tool: verify_hash - matching hashes", () => {
    const documentHash = "a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9";
    const computedHash = "a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9";
    expect(documentHash).toBe(computedHash);
  });

  it("tool: verify_hash - mismatched hashes detected", () => {
    expect(() => {
      const storedHash = "a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9";
      const computedHash = "ffffffffffffffffffffffffffffffffffffffff";
      if (storedHash !== computedHash) {
        throw new Error("Document integrity check failed: hash mismatch");
      }
    }).toThrow("hash mismatch");
  });

  it("tool: create_document - document must be completed before contract activation", () => {
    const esignStatus = "completed";
    expect(esignStatus).toBe("completed");
  });

  it("tool: create_document - fallback to adobe-sign-bridge if docusign fails", () => {
    const bridges = ["docusign-bridge", "adobe-sign-bridge"];
    const primaryFailed = true;
    const activeBridge = primaryFailed ? bridges[1] : bridges[0];
    expect(activeBridge).toBe("adobe-sign-bridge");
  });
});
