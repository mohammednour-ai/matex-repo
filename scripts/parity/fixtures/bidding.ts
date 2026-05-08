import type { ParityFixture } from "../runner.ts";

export function biddingFixtures(_env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "bidding.ping", args: {} },
    {
      name: "get_highest_bid for nonexistent listing",
      tool: "bidding.get_highest_bid",
      args: { listing_id: "00000000-0000-0000-0000-000000000000" },
    },
    {
      name: "place_bid validation: missing listing",
      tool: "bidding.place_bid",
      args: { amount: 100 },
      expectError: true,
    },
  ];
}
