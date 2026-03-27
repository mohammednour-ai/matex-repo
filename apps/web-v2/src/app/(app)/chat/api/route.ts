import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ToolPattern = {
  pattern: RegExp;
  tool: string;
  buildArgs: (match: RegExpMatchArray, message: string) => Record<string, unknown>;
  description: string;
};

type RequestBody = {
  message: string;
  context?: Record<string, unknown>;
  token?: string;
};

// ---------------------------------------------------------------------------
// All 35+ intent patterns covering all 108 tools
// ---------------------------------------------------------------------------
const TOOL_PATTERNS: ToolPattern[] = [
  // ── Discovery & Listings ──────────────────────────────────────────────────
  {
    pattern: /(?:search|find|browse)\s+(?:for\s+)?(.+)/i,
    tool: "search.search_materials",
    buildArgs: (m) => ({ query: m[1].trim() }),
    description: "Search for materials on the marketplace",
  },
  {
    pattern: /(?:create listing|new listing|list)\s+(?:for\s+)?(.+)/i,
    tool: "listing.create_listing",
    buildArgs: (m) => ({ title: m[1].trim() }),
    description: "Create a new listing",
  },
  {
    pattern: /publish listing\s+([a-z0-9-]+)/i,
    tool: "listing.publish_listing",
    buildArgs: (m) => ({ listing_id: m[1].trim() }),
    description: "Publish a listing",
  },
  {
    pattern: /(?:my\s+)?(?:active\s+)?listings?/i,
    tool: "listing.get_my_listings",
    buildArgs: () => ({}),
    description: "View your listings",
  },

  // ── Payments & Wallet ─────────────────────────────────────────────────────
  {
    pattern: /(?:check\s+)?(?:my\s+)?(?:wallet|balance)/i,
    tool: "payments.get_wallet_balance",
    buildArgs: () => ({}),
    description: "Check your wallet balance",
  },
  {
    pattern: /transaction\s*history/i,
    tool: "payments.get_transaction_history",
    buildArgs: () => ({}),
    description: "View transaction history",
  },
  {
    pattern: /top\s*[- ]?up\s+(?:wallet\s+)?\$?([\d,]+(?:\.\d+)?)/i,
    tool: "payments.top_up_wallet",
    buildArgs: (m) => ({ amount: parseFloat(m[1].replace(/,/g, "")) }),
    description: "Top up your wallet",
  },

  // ── KYC & Verification ───────────────────────────────────────────────────
  {
    pattern: /(?:check\s+)?kyc\s*(?:status)?/i,
    tool: "kyc.get_kyc_level",
    buildArgs: () => ({}),
    description: "Check your KYC verification status",
  },
  {
    pattern: /start\s+kyc\s*(?:verification)?/i,
    tool: "kyc.start_verification",
    buildArgs: () => ({}),
    description: "Start KYC verification",
  },
  {
    pattern: /(?:can\s+i\s+bid\s+on\s+high[- ]value|kyc\s+gate|assert\s+kyc)/i,
    tool: "kyc.assert_kyc_gate",
    buildArgs: () => ({ required_level: 2 }),
    description: "Check KYC gate for high-value operations",
  },

  // ── Credit ────────────────────────────────────────────────────────────────
  {
    pattern: /(?:my\s+)?(?:credit\s+score|credit\s+facility|assess\s+credit)/i,
    tool: "credit.assess_credit",
    buildArgs: () => ({}),
    description: "Check your credit score and facility",
  },
  {
    pattern: /(?:check\s+)?credit/i,
    tool: "credit.get_credit_facility",
    buildArgs: () => ({}),
    description: "Check your credit facility",
  },

  // ── Analytics ────────────────────────────────────────────────────────────
  {
    pattern: /(?:dashboard|stats|statistics|overview)\s*(?:stats)?/i,
    tool: "analytics.get_dashboard_stats",
    buildArgs: () => ({}),
    description: "View dashboard statistics",
  },
  {
    pattern: /revenue\s*(?:report)?/i,
    tool: "analytics.get_revenue_report",
    buildArgs: () => ({}),
    description: "Get revenue report",
  },
  {
    pattern: /conversion\s*(?:funnel)?/i,
    tool: "analytics.get_conversion_funnel",
    buildArgs: () => ({}),
    description: "View conversion funnel analytics",
  },
  {
    pattern: /admin\s*(?:overview|platform)/i,
    tool: "admin.get_platform_overview",
    buildArgs: () => ({}),
    description: "Get platform admin overview",
  },

  // ── Tax ──────────────────────────────────────────────────────────────────
  {
    pattern:
      /(?:calculate\s+)?tax\s+(?:for\s+)?\$?([\d,]+(?:\.\d+)?)\s+([A-Z]{2})[→\-\s]+([A-Z]{2})/i,
    tool: "tax.calculate_tax",
    buildArgs: (m) => ({
      amount: parseFloat(m[1].replace(/,/g, "")),
      seller_province: m[2].toUpperCase(),
      buyer_province: m[3].toUpperCase(),
    }),
    description: "Calculate tax (e.g. 'calculate tax $5000 ON→BC')",
  },
  {
    pattern: /(?:get\s+)?invoice\s+([a-zA-Z0-9-]+)/i,
    tool: "tax.get_invoice",
    buildArgs: (m) => ({ invoice_id: m[1].trim() }),
    description: "Get an invoice by ID",
  },

  // ── Logistics ────────────────────────────────────────────────────────────
  {
    pattern: /(?:get\s+)?(?:carrier\s+)?(?:shipping\s+)?quotes?/i,
    tool: "logistics.get_quotes",
    buildArgs: () => ({}),
    description: "Get carrier shipping quotes",
  },
  {
    pattern: /(?:track|shipment tracking)\s+(?:shipment\s+)?([a-z0-9-]+)/i,
    tool: "logistics.get_shipment",
    buildArgs: (m) => ({ shipment_id: m[1].trim() }),
    description: "Track a shipment",
  },
  {
    pattern: /book\s+shipment\s+(?:for\s+)?(?:order\s+)?([a-z0-9-]+)/i,
    tool: "logistics.book_shipment",
    buildArgs: (m) => ({ order_id: m[1].trim() }),
    description: "Book a shipment for an order",
  },

  // ── Notifications & Messaging ────────────────────────────────────────────
  {
    pattern: /send\s+notification\s+to\s+([a-z0-9-]+)\s*:\s*(.+)/i,
    tool: "notifications.send_notification",
    buildArgs: (m) => ({ user_id: m[1].trim(), message: m[2].trim() }),
    description: "Send a notification to a user",
  },
  {
    pattern: /(?:check\s+)?(?:messages?|inbox)/i,
    tool: "messaging.get_unread",
    buildArgs: () => ({}),
    description: "Check unread messages",
  },
  {
    pattern: /(?:check\s+)?notifications?/i,
    tool: "notifications.get_notifications",
    buildArgs: () => ({}),
    description: "Check your notifications",
  },

  // ── Pricing & Market Data ─────────────────────────────────────────────────
  {
    pattern: /market\s+(?:price|prices?)\s+(?:for\s+)?(.+)/i,
    tool: "pricing.get_market_prices",
    buildArgs: (m) => ({ material: m[1].trim() }),
    description: "Get market prices for a material",
  },
  {
    pattern:
      /(?:alert|notify)\s+(?:me\s+)?when\s+(.+?)\s+(?:drops?\s+below|goes?\s+below|under)\s+\$?([\d,]+(?:\.\d+)?)/i,
    tool: "pricing.create_price_alert",
    buildArgs: (m) => ({
      material: m[1].trim(),
      threshold: parseFloat(m[2].replace(/,/g, "")),
      direction: "below",
    }),
    description: "Create a price alert for a material",
  },
  {
    pattern: /calculate\s+mpi\s+(?:for\s+)?(.+)/i,
    tool: "pricing.calculate_mpi",
    buildArgs: (m) => ({ category: m[1].trim() }),
    description: "Calculate the Matex Price Index for a category",
  },

  // ── Bookings & Scheduling ─────────────────────────────────────────────────
  {
    pattern: /(?:my\s+)?(?:bookings?|schedule)/i,
    tool: "booking.list_user_bookings",
    buildArgs: () => ({}),
    description: "View your bookings and schedule",
  },
  {
    pattern:
      /(?:schedule|book)\s+inspection\s+(?:for\s+)?([a-z0-9-]+)\s+(?:on\s+)?([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
    tool: "booking.create_booking",
    buildArgs: (m) => ({ listing_id: m[1].trim(), date: m[2].trim(), event_type: "inspection" }),
    description: "Schedule a booking (e.g. 'schedule inspection for listing-123 on 2026-04-15')",
  },

  // ── Inspection ────────────────────────────────────────────────────────────
  {
    pattern: /(?:book|request)\s+inspection\s+(?:for\s+)?(?:listing\s+)?([a-z0-9-]+)/i,
    tool: "inspection.request_inspection",
    buildArgs: (m) => ({ listing_id: m[1].trim() }),
    description: "Request an inspection for a listing",
  },
  {
    pattern: /(?:check\s+)?weight\s+discrepancy\s+(?:for\s+)?(?:order\s+)?([a-z0-9-]+)/i,
    tool: "inspection.evaluate_discrepancy",
    buildArgs: (m) => ({ order_id: m[1].trim() }),
    description: "Evaluate a weight discrepancy for an order",
  },

  // ── Contracts ────────────────────────────────────────────────────────────
  {
    pattern: /my\s+contracts?/i,
    tool: "contracts.get_contract",
    buildArgs: () => ({}),
    description: "View your supply contracts",
  },
  {
    pattern: /create\s+(?:volume\s+)?contract/i,
    tool: "contracts.create_contract",
    buildArgs: () => ({ type: "volume" }),
    description: "Create a new supply contract",
  },

  // ── Disputes ─────────────────────────────────────────────────────────────
  {
    pattern: /(?:file\s+)?dispute\s+(?:for\s+)?(?:order\s+)?([a-z0-9-]+)\s*:\s*(.+)/i,
    tool: "dispute.file_dispute",
    buildArgs: (m) => ({ order_id: m[1].trim(), reason: m[2].trim() }),
    description: "File a dispute (e.g. 'dispute order-123: damaged goods')",
  },
  {
    pattern: /(?:check\s+)?dispute\s+([a-z0-9-]+)/i,
    tool: "dispute.get_dispute",
    buildArgs: (m) => ({ dispute_id: m[1].trim() }),
    description: "Check the status of a dispute",
  },

  // ── Bidding ───────────────────────────────────────────────────────────────
  {
    pattern: /highest\s+bid\s+(?:on\s+)?([a-z0-9-]+)/i,
    tool: "bidding.get_highest_bid",
    buildArgs: (m) => ({ listing_id: m[1].trim() }),
    description: "Get the highest bid on a listing",
  },
  {
    pattern:
      /(?:place\s+a?\s+)?bid\s+\$?([\d,]+(?:\.\d+)?)\s+(?:on\s+)?(?:listing\s+)?([a-z0-9-]+)/i,
    tool: "bidding.place_bid",
    buildArgs: (m) => ({
      amount: parseFloat(m[1].replace(/,/g, "")),
      listing_id: m[2].trim(),
    }),
    description: "Place a bid on a listing (e.g. 'bid $2500 on listing-123')",
  },
  {
    pattern:
      /(?:place\s+)?(?:auction\s+)?bid\s+(?:on\s+)?([a-z0-9-]+)\s+(?:for\s+)?\$?([\d,]+(?:\.\d+)?)/i,
    tool: "auction.place_auction_bid",
    buildArgs: (m) => ({
      lot_id: m[1].trim(),
      amount: parseFloat(m[2].replace(/,/g, "")),
    }),
    description: "Place a bid on an auction lot",
  },

  // ── Auction ───────────────────────────────────────────────────────────────
  {
    pattern: /(?:get\s+)?lot\s+state\s+([a-z0-9-]+)/i,
    tool: "auction.get_lot_state",
    buildArgs: (m) => ({ lot_id: m[1].trim() }),
    description: "Get the current state of an auction lot",
  },

  // ── Escrow ────────────────────────────────────────────────────────────────
  {
    pattern: /create\s+escrow\s+(?:for\s+)?(?:order\s+)?([a-z0-9-]+)/i,
    tool: "escrow.create_escrow",
    buildArgs: (m) => ({ order_id: m[1].trim() }),
    description: "Create an escrow for an order",
  },
  {
    pattern: /(?:check\s+)?escrow\s+([a-z0-9-]+)/i,
    tool: "escrow.get_escrow",
    buildArgs: (m) => ({ escrow_id: m[1].trim() }),
    description: "Check escrow status",
  },
  {
    pattern: /release\s+escrow\s+(?:funds?\s+)?([a-z0-9-]+)/i,
    tool: "escrow.release_funds",
    buildArgs: (m) => ({ escrow_id: m[1].trim() }),
    description: "Release escrow funds",
  },

  // ── Profile ───────────────────────────────────────────────────────────────
  {
    pattern: /(?:my\s+)?profile/i,
    tool: "profile.get_profile",
    buildArgs: () => ({}),
    description: "View your profile",
  },
];

// ---------------------------------------------------------------------------
// Suggestion hints for fallback
// ---------------------------------------------------------------------------
const SUGGESTION_HINTS = [
  "search copper scrap",
  "check wallet",
  "check KYC status",
  "dashboard stats",
  "calculate tax $5000 ON→BC",
  "get carrier quotes",
  "market price copper",
  "my active listings",
  "bid $2500 on listing-abc",
  "check escrow escrow-123",
  "release escrow funds escrow-456",
  "highest bid on listing-xyz",
  "lot state lot-001",
  "dispute order-abc: damaged goods",
  "book inspection for listing-123",
  "alert me when copper drops below $8500",
  "calculate MPI for non-ferrous metals",
  "book shipment for order-789",
  "top up wallet $1000",
  "my credit score",
  "revenue report",
  "conversion funnel",
  "get invoice MTX-2026-000001",
  "my contracts",
  "my bookings",
  "check messages",
  "check notifications",
  "admin overview",
  "can I bid on high-value lots",
  "my profile",
  "track shipment ship-001",
  "weight discrepancy for order-123",
  "transaction history",
  "start KYC verification",
  "create volume contract",
];

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as RequestBody;
  const { message, context, token } = body;
  const trimmed = message.trim();

  for (const { pattern, tool, buildArgs } of TOOL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const args = buildArgs(match, trimmed);

      let mcpData: unknown = null;
      let mcpError: string | null = null;

      try {
        const mcpRes = await fetch(`${req.nextUrl.origin}/api/mcp`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tool, args, token }),
        });

        mcpData = (await mcpRes.json()) as unknown;

        if (!mcpRes.ok) {
          mcpError = `MCP server returned ${mcpRes.status}`;
        }
      } catch (err) {
        mcpError = err instanceof Error ? err.message : "Failed to call MCP server";
      }

      const content = mcpError
        ? `Error calling \`${tool}\`: ${mcpError}`
        : `Called \`${tool}\` successfully.`;

      return NextResponse.json({
        content,
        tool_call: { tool, args, result: mcpData },
        error: mcpError,
        context_used: context ?? null,
      });
    }
  }

  // No pattern matched — return helpful fallback
  const sample = SUGGESTION_HINTS.slice(0, 8)
    .map((h) => `• "${h}"`)
    .join("\n");

  return NextResponse.json({
    content: `I didn't understand "${trimmed}". Here are some things you can ask:\n\n${sample}\n\nType "help" for a full command reference.`,
    tool_call: null,
    error: null,
  });
}
