import type { ParityFixture } from "../runner.ts";

export function paymentsFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "payments.ping", args: {} },
    {
      name: "get_wallet_balance for self",
      tool: "payments.get_wallet_balance",
      args: { user_id: env.userId },
    },
    {
      name: "get_transaction_history for self",
      tool: "payments.get_transaction_history",
      args: { user_id: env.userId, limit: 5 },
    },
    {
      name: "manage_payment_methods list",
      tool: "payments.manage_payment_methods",
      args: { user_id: env.userId, action: "list" },
    },
    {
      name: "process_payment validation: missing fields",
      tool: "payments.process_payment",
      args: {},
      expectError: true,
    },
    {
      name: "top_up_wallet validation: amount=0",
      tool: "payments.top_up_wallet",
      args: { user_id: env.userId, amount: 0 },
      expectError: true,
    },
  ];
}
