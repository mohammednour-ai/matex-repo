// Analytics parity fixtures — read-only KPIs. Admin-gated tools require
// PARITY_TEST_USER_ID to belong to a platform admin; otherwise they FORBID
// from both transports identically (still parity).

import type { ParityFixture } from "../runner.ts";

export function analyticsFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "analytics.ping", args: {} },
    {
      name: "get_dashboard_stats",
      tool: "analytics.get_dashboard_stats",
      args: {},
    },
    {
      name: "get_conversion_funnel default 30d",
      tool: "analytics.get_conversion_funnel",
      args: {},
    },
    {
      name: "export_data validation: bad query_type",
      tool: "analytics.export_data",
      args: { query_type: "bogus", _user_id: env.userId },
      expectError: true,
    },
  ];
}
