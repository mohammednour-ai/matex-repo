import type { ParityFixture } from "../runner.ts";

export function disputeFixtures(_env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "dispute.ping", args: {} },
    {
      name: "get_dispute not found",
      tool: "dispute.get_dispute",
      args: { dispute_id: "00000000-0000-0000-0000-000000000000" },
      expectError: true,
    },
    {
      name: "file_dispute validation: missing fields",
      tool: "dispute.file_dispute",
      args: {},
      expectError: true,
    },
  ];
}
