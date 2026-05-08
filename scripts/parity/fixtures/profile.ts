// Profile parity fixtures — get_profile on the test user; no mutations.

import type { ParityFixture } from "../runner.ts";

export function profileFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "profile.ping", args: {} },
    {
      name: "get_profile for self",
      tool: "profile.get_profile",
      args: { user_id: env.userId },
    },
    {
      name: "update_profile validation: fields missing",
      tool: "profile.update_profile",
      args: { user_id: env.userId },
      expectError: true,
    },
    {
      name: "add_bank_account validation: bad last4",
      tool: "profile.add_bank_account",
      args: { user_id: env.userId, account_last4: "ab" },
      expectError: true,
    },
  ];
}
