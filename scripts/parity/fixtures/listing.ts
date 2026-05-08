import type { ParityFixture } from "../runner.ts";

export function listingFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "listing.ping", args: {} },
    {
      name: "list_listings default page",
      tool: "listing.list_listings",
      args: { limit: 5 },
    },
    {
      name: "get_my_listings for self",
      tool: "listing.get_my_listings",
      args: { user_id: env.userId, limit: 5 },
    },
    {
      name: "list_categories (read-only)",
      tool: "listing.list_categories",
      args: {},
    },
    {
      name: "list_favorites for self",
      tool: "listing.list_favorites",
      args: { user_id: env.userId, limit: 5 },
    },
    {
      name: "get_listing not found",
      tool: "listing.get_listing",
      args: { listing_id: "00000000-0000-0000-0000-000000000000" },
      expectError: true,
    },
    {
      name: "create_listing validation: missing fields",
      tool: "listing.create_listing",
      args: {},
      expectError: true,
    },
  ];
}
