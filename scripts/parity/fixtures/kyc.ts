import type { ParityFixture } from "../runner.ts";

export function kycFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "kyc.ping", args: {} },
    {
      name: "get_kyc_level for self",
      tool: "kyc.get_kyc_level",
      args: { user_id: env.userId },
    },
    {
      name: "assert_kyc_gate level_0 (always passes)",
      tool: "kyc.assert_kyc_gate",
      args: { user_id: env.userId, required_level: "level_0" },
    },
    {
      name: "start_verification validation: missing target_level",
      tool: "kyc.start_verification",
      args: { user_id: env.userId },
      expectError: true,
    },
  ];
}
