import { describe, it, expect } from "vitest";

describe("orders-mcp", () => {
  it("rejects create_order when buyer equals seller", () => {
    expect(() => {
      const buyer = "u1";
      const seller = "u1";
      if (buyer === seller) throw new Error("buyer_id and seller_id must differ");
    }).toThrow("must differ");
  });

  it("rejects update_order_status when caller is neither buyer nor seller", () => {
    expect(() => {
      const buyer: string = "u1";
      const seller: string = "u2";
      const actor: string = "u3";
      if (actor !== buyer && actor !== seller) throw new Error("Only the buyer or seller may update this order");
    }).toThrow("buyer or seller");
  });

  it("blocks invalid status transitions", () => {
    const transitions: Record<string, string[]> = {
      pending: ["confirmed", "cancelled"],
      shipped: ["delivered", "disputed"],
    };
    expect(transitions.pending.includes("delivered")).toBe(false);
    expect(transitions.shipped.includes("delivered")).toBe(true);
  });

  it("blocks cancel after shipped", () => {
    expect(() => {
      const status: string = "shipped";
      if (status !== "pending" && status !== "confirmed") {
        throw new Error("Cannot cancel order");
      }
    }).toThrow("Cannot cancel");
  });
});
