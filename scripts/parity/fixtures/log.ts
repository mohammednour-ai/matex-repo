// Log parity fixtures — search reads from log_mcp.audit_log; safe across runs.

import type { ParityFixture } from "../runner.ts";

export function logFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "log.ping", args: {} },
    {
      name: "search_logs head=1",
      tool: "log.search_logs",
      args: { head: 1 },
    },
    {
      name: "verify_integrity (edge returns trivial true)",
      tool: "log.verify_integrity",
      args: {},
    },
  ];
}
