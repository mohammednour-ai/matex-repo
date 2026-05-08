import type { ParityFixture } from "../runner.ts";

export function inspectionFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "inspection.ping", args: {} },
    {
      name: "list_inspections for self",
      tool: "inspection.list_inspections",
      args: { user_id: env.userId, limit: 5 },
    },
    {
      name: "get_inspection not found",
      tool: "inspection.get_inspection",
      args: { inspection_id: "00000000-0000-0000-0000-000000000000" },
      expectError: true,
    },
    {
      name: "request_inspection validation: missing fields",
      tool: "inspection.request_inspection",
      args: {},
      expectError: true,
    },
  ];
}
