import type { ParityFixture } from "../runner.ts";

export function messagingFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "messaging.ping", args: {} },
    {
      name: "list_threads for self",
      tool: "messaging.list_threads",
      args: { user_id: env.userId, limit: 5 },
    },
    {
      name: "get_unread for self",
      tool: "messaging.get_unread",
      args: { user_id: env.userId },
    },
    {
      name: "create_thread validation: 1 participant",
      tool: "messaging.create_thread",
      args: { participants: [env.userId] },
      expectError: true,
    },
  ];
}
