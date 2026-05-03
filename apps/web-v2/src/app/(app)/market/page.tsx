import { MarketIntelligenceDashboard } from "@/components/intelligence/MarketIntelligenceDashboard";

/**
 * Top-level Matex Intelligence dashboard. Renders the market summary cards
 * for every tracked material and the user's price alerts. The component is a
 * Client Component (it talks to /api/intelligence/* with the user's bearer
 * token from localStorage) so this page is just a thin wrapper.
 */
export default function MarketPage() {
  return <MarketIntelligenceDashboard />;
}
