import type { ParityFixture } from "../runner.ts";

export function logisticsFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "logistics.ping", args: {} },
    {
      name: "list_shipments for self",
      tool: "logistics.list_shipments",
      args: { user_id: env.userId, limit: 5 },
    },
    {
      name: "get_shipment validation: missing identifier",
      tool: "logistics.get_shipment",
      args: {},
      expectError: true,
    },
    {
      name: "get_quotes validation: missing fields",
      tool: "logistics.get_quotes",
      args: {},
      expectError: true,
    },
  ];
}
