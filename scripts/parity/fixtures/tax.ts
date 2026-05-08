// Tax parity fixtures — pure math + read-only invoice lookups.

import type { ParityFixture } from "../runner.ts";

export function taxFixtures(_env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "tax.ping", args: {} },
    {
      name: "calculate_tax ON $1000",
      tool: "tax.calculate_tax",
      args: { amount: 1000, seller_province: "ON", buyer_province: "ON" },
    },
    {
      name: "calculate_tax BC $500 (GST+PST)",
      tool: "tax.calculate_tax",
      args: { amount: 500, seller_province: "ON", buyer_province: "BC" },
    },
    {
      name: "get_invoice missing identifier",
      tool: "tax.get_invoice",
      args: {},
      expectError: true,
    },
    {
      name: "calculate_tax validation: amount=0",
      tool: "tax.calculate_tax",
      args: { amount: 0, seller_province: "ON", buyer_province: "ON" },
      expectError: true,
    },
  ];
}
