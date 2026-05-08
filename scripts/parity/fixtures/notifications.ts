import type { ParityFixture } from "../runner.ts";

export function notificationsFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "notifications.ping", args: {} },
    {
      name: "get_notifications for self",
      tool: "notifications.get_notifications",
      args: { user_id: env.userId, limit: 5 },
    },
    {
      name: "get_preferences for self",
      tool: "notifications.get_preferences",
      args: { user_id: env.userId },
    },
    {
      name: "send_notification validation: bad channel",
      tool: "notifications.send_notification",
      args: { user_id: env.userId, type: "test", title: "T", body: "B", channels: ["telegram"] },
      expectError: true,
    },
  ];
}
