import type { ParityFixture } from "../runner.ts";

export function ordersFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "orders.ping", args: {} },
    {
      name: "list_orders for self",
      tool: "orders.list_orders",
      args: { user_id: env.userId, limit: 5 },
    },
    {
      name: "get_order not found",
      tool: "orders.get_order",
      args: { order_id: "00000000-0000-0000-0000-000000000000" },
      expectError: true,
    },
    {
      name: "create_order validation: missing fields",
      tool: "orders.create_order",
      args: {},
      expectError: true,
    },
    {
      name: "update_order_status validation: missing fields",
      tool: "orders.update_order_status",
      args: {},
      expectError: true,
    },
  ];
}
