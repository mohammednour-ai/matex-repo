import type { ParityFixture } from "../runner.ts";

export function contractsFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "contracts.ping", args: {} },
    {
      name: "list_contracts for self",
      tool: "contracts.list_contracts",
      args: { user_id: env.userId, limit: 5 },
    },
    {
      name: "get_contract not found",
      tool: "contracts.get_contract",
      args: { contract_id: "00000000-0000-0000-0000-000000000000" },
      expectError: true,
    },
    {
      name: "create_contract validation: missing fields",
      tool: "contracts.create_contract",
      args: {},
      expectError: true,
    },
  ];
}
