// Admin parity fixtures. All non-ping tools require platform_admin; if the
// PARITY_TEST_USER_ID is not an admin, both transports return identical
// FORBIDDEN envelopes — that's still parity.

import type { ParityFixture } from "../runner.ts";

export function adminFixtures(_env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "admin.ping", args: {} },
    {
      name: "get_platform_overview (admin or FORBIDDEN)",
      tool: "admin.get_platform_overview",
      args: {},
    },
    {
      name: "list_users default page (admin or FORBIDDEN)",
      tool: "admin.list_users",
      args: { limit: 5 },
    },
    {
      name: "suspend_user validation: missing reason",
      tool: "admin.suspend_user",
      args: { user_id: "00000000-0000-0000-0000-000000000000" },
      expectError: true,
    },
  ];
}
