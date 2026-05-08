import type { ParityFixture } from "../runner.ts";

export function creditFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "credit.ping", args: {} },
    {
      name: "get_credit_facility for self (may be null)",
      tool: "credit.get_credit_facility",
      args: { user_id: env.userId },
    },
    {
      name: "get_credit_history for self",
      tool: "credit.get_credit_history",
      args: { user_id: env.userId },
    },
    {
      name: "draw_credit validation: amount=0",
      tool: "credit.draw_credit",
      args: { user_id: env.userId, amount: 0 },
      expectError: true,
    },
  ];
}
