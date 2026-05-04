// Escrow parity fixtures. ping + list_escrows are read-only and safe to run
// repeatedly. Mutating flows (create→hold→release) are gated behind ESCROW_RW=1
// so CI can run the read-only set against staging without polluting it.

import type { ParityFixture } from "../runner.ts";

export function escrowFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  const fx: ParityFixture[] = [
    { name: "ping", tool: "escrow.ping", args: {} },
    {
      name: "list_escrows by user (no results expected for fresh user is fine)",
      tool: "escrow.list_escrows",
      args: { user_id: env.userId, limit: 5 },
    },
    {
      name: "get_escrow with bogus id → NOT_FOUND",
      tool: "escrow.get_escrow",
      args: { escrow_id: "00000000-0000-0000-0000-000000000000" },
      expectError: true,
    },
    {
      name: "create_escrow validation: missing buyer",
      tool: "escrow.create_escrow",
      args: { seller_id: env.userId, amount: 100 },
      expectError: true,
    },
  ];

  if (env.rw) {
    // Reserved for the create→hold→release chain. Implement when we have a
    // throwaway buyer/seller pair plus cleanup. Keeping this as a stub keeps
    // the read-only path clean for CI.
  }

  return fx;
}
