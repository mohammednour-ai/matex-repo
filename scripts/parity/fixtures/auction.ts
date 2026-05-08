import type { ParityFixture } from "../runner.ts";

export function auctionFixtures(_env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "auction.ping", args: {} },
    {
      name: "list_auctions default",
      tool: "auction.list_auctions",
      args: { limit: 5 },
    },
    {
      name: "get_auction not found",
      tool: "auction.get_auction",
      args: { auction_id: "00000000-0000-0000-0000-000000000000" },
      expectError: true,
    },
    {
      name: "create_auction validation: missing fields",
      tool: "auction.create_auction",
      args: {},
      expectError: true,
    },
  ];
}
