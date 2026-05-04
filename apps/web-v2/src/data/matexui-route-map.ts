/**
 * MatexUI static HTML prototypes (D:\MatexUI) mapped to web-v2 routes.
 * - "visual": layout/density inspired by HTML mockups; data still from MCP.
 * - "live": primary data wired through Next + gateway + adapters.
 */
export const MATEXUI_TO_WEB_V2_ROUTES = {
  "main-dashboard.html": { route: "/dashboard", kind: "live" as const },
  "dashboard.html": { route: "/dashboard", kind: "visual" as const },
  "analytics-dashboard.html": { route: "/analytics", kind: "live" as const },
  "marketplace.html": { route: "/search", kind: "live" as const },
} as const;
