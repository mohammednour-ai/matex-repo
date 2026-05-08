import type { ParityFixture } from "../runner.ts";

export function pricingFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "pricing.ping", args: {} },
    {
      name: "get_market_prices default",
      tool: "pricing.get_market_prices",
      args: { limit: 5 },
    },
    {
      name: "get_price_alerts for self",
      tool: "pricing.get_price_alerts",
      args: { user_id: env.userId },
    },
    {
      name: "create_price_alert validation: bad direction",
      tool: "pricing.create_price_alert",
      args: { user_id: env.userId, material: "copper", threshold_price: 100, direction: "sideways" },
      expectError: true,
    },
  ];
}
