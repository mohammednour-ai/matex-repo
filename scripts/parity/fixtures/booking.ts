import type { ParityFixture } from "../runner.ts";

export function bookingFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "booking.ping", args: {} },
    {
      name: "list_user_bookings for self",
      tool: "booking.list_user_bookings",
      args: { user_id: env.userId },
    },
    {
      name: "create_booking validation: missing fields",
      tool: "booking.create_booking",
      args: {},
      expectError: true,
    },
  ];
}
