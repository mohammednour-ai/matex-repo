import type { ParityFixture } from "../runner.ts";

export function searchFixtures(env: { userId: string; rw: boolean }): ParityFixture[] {
  return [
    { name: "ping", tool: "search.ping", args: {} },
    {
      name: "search_materials by query",
      tool: "search.search_materials",
      args: { query: "copper", limit: 5 },
    },
    {
      name: "filter_by_category",
      tool: "search.filter_by_category",
      args: { category: "ferrous", limit: 5 },
    },
    {
      name: "get_saved_searches for self",
      tool: "search.get_saved_searches",
      args: { user_id: env.userId },
    },
    {
      name: "geo_search with bounding box",
      tool: "search.geo_search",
      args: { lat: 43.65, lng: -79.38, radius_km: 50, limit: 5 },
    },
    {
      name: "save_search validation: missing query",
      tool: "search.save_search",
      args: { user_id: env.userId },
      expectError: true,
    },
  ];
}
