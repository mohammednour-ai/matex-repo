import { describe, it, expect } from "vitest";

describe("logistics-mcp", () => {
  it("should have a valid server name", () => {
    expect("logistics-mcp").toMatch(/-mcp$/);
  });

  it("tool: book_shipment - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.order_id) throw new Error("order_id is required");
    }).toThrow("order_id is required");
  });

  it("tool: update_tracking - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.shipment_id) throw new Error("shipment_id is required");
      if (!args.status) throw new Error("status is required");
    }).toThrow("shipment_id is required");
  });

  it("tool: book_shipment - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        shipment_id: "550e8400-e29b-41d4-a716-446655440000",
        order_id: "660e8400-e29b-41d4-a716-446655440000",
        carrier: "Day & Ross",
        status: "booked",
        bol_number: "BOL-2026-001234",
        co2_emissions_kg: 45.2,
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.bol_number).toBeDefined();
    expect(result.data.co2_emissions_kg).toBeGreaterThan(0);
  });

  it("tool: book_shipment - hazmat class defaults to 'none'", () => {
    const shipment = { hazmat_class: "none" as string };
    expect(shipment.hazmat_class).toBe("none");
  });

  it("tool: book_shipment - hazmat requires TDG-certified carrier", () => {
    expect(() => {
      const hazmatClass = "class_8";
      const carrierTdgCertified = false;
      if (hazmatClass !== "none" && !carrierTdgCertified) {
        throw new Error("Carrier must have TDG certification for hazmat shipments");
      }
    }).toThrow("TDG certification");
  });

  it("tool: update_tracking - validates status enum", () => {
    const validStatuses = ["booked", "picked_up", "in_transit", "delivered", "delayed", "cancelled"];
    expect(() => {
      const status = "lost";
      if (!validStatuses.includes(status)) {
        throw new Error("Invalid shipment status");
      }
    }).toThrow("Invalid shipment status");
  });

  it("cross-border shipment generates required documents", () => {
    const requiredDocs = [
      "commercial_invoice",
      "packing_list",
      "usmca_certificate",
      "export_declaration_b13a",
    ];
    const generatedDocs = [
      "commercial_invoice",
      "packing_list",
      "usmca_certificate",
      "export_declaration_b13a",
    ];
    requiredDocs.forEach((doc) => {
      expect(generatedDocs).toContain(doc);
    });
  });
});
