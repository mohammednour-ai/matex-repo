import { NextRequest, NextResponse } from "next/server";

const TOOL_PATTERNS: Array<{
  pattern: RegExp;
  tool: string;
  buildArgs: (match: RegExpMatchArray, message: string) => Record<string, unknown>;
  description: string;
}> = [
  // Discovery & listings
  {
    pattern: /(?:search|find)\s+(?:for\s+)?(.+)/i,
    tool: "search.search_materials",
    buildArgs: (m) => ({ query: m[1].trim() }),
    description: "Search for materials on the marketplace",
  },
  {
    pattern: /(?:create listing|new listing)\s+(?:for\s+)?(.+)/i,
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
    pattern: /my listings/i,
    tool: "listing.get_my_listings",
    buildArgs: () => ({}),
    description: "View your listings",
  },

  // Payments & wallet
  {
    pattern: /(?:check )?(?:wallet|balance)/i,
    tool: "payments.get_wallet_balance",
    buildArgs: () => ({}),
    description: "Check your wallet balance",
  },
  {
    pattern: /transaction history/i,
    tool: "payments.get_transaction_history",
    buildArgs: () => ({}),
    description: "View transaction history",
  },

  // KYC & credit
  {
    pattern: /(?:check )?kyc\s*(?:status)?/i,
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
    pattern: /(?:check )?credit/i,
    tool: "credit.get_credit_facility",
    buildArgs: () => ({}),
    description: "Check your credit facility",
  },

  // Analytics & reporting
  {
    pattern: /(?:dashboard|stats|statistics|overview)/i,
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

  // Tax
  {
    pattern: /(?:calculate )?tax\s+(?:for\s+)?\$?([\d,]+(?:\.\d+)?)\s+([A-Z]{2})\s+([A-Z]{2})/i,
    tool: "tax.calculate_tax",
    buildArgs: (m) => ({
      amount: parseFloat(m[1].replace(/,/g, "")),
      seller_province: m[2].toUpperCase(),
      buyer_province: m[3].toUpperCase(),
    }),
    description: "Calculate tax (e.g. 'calculate tax for $5000 ON BC')",
  },

  // Logistics
  {
    pattern: /(?:shipping|carrier)\s*(?:quotes?)?/i,
    tool: "logistics.get_quotes",
    buildArgs: () => ({}),
    description: "Get carrier shipping quotes",
  },
  {
    pattern: /(?:shipment tracking|track\s+shipment)\s+([a-z0-9-]+)/i,
    tool: "logistics.get_shipment",
    buildArgs: (m) => ({ shipment_id: m[1].trim() }),
    description: "Track a shipment",
  },

  // Notifications & messaging
  {
    pattern: /send\s+notification\s+to\s+([a-z0-9-]+)\s*:\s*(.+)/i,
    tool: "notifications.send_notification",
    buildArgs: (m) => ({ user_id: m[1].trim(), message: m[2].trim() }),
    description: "Send a notification to a user",
  },
  {
    pattern: /(?:check )?(?:messages|inbox)/i,
    tool: "messaging.get_unread",
    buildArgs: () => ({}),
    description: "Check unread messages",
  },
  {
    pattern: /(?:check )?notifications/i,
    tool: "notifications.get_notifications",
    buildArgs: () => ({}),
    description: "Check your notifications",
  },

  // Pricing
  {
    pattern: /market\s+prices?\s+(?:for\s+)?(.+)/i,
    tool: "pricing.get_market_prices",
    buildArgs: (m) => ({ material: m[1].trim() }),
    description: "Get market prices for a material",
  },

  // Bookings & scheduling
  {
    pattern: /(?:my\s+)?(?:bookings?|schedule)/i,
    tool: "booking.list_user_bookings",
    buildArgs: () => ({}),
    description: "View your bookings and schedule",
  },
  {
    pattern: /book\s+inspection\s+(?:for\s+)?([a-z0-9-]+)/i,
    tool: "inspection.request_inspection",
    buildArgs: (m) => ({ listing_id: m[1].trim() }),
    description: "Book an inspection for a listing",
  },

  // Contracts
  {
    pattern: /my\s+contracts?/i,
    tool: "contracts.get_contract",
    buildArgs: () => ({}),
    description: "View your supply contracts",
  },

  // Disputes
  {
    pattern: /(?:file\s+)?dispute\s+(?:for\s+)?(?:order\s+)?([a-z0-9-]+)\s*:\s*(.+)/i,
    tool: "dispute.file_dispute",
    buildArgs: (m) => ({ order_id: m[1].trim(), reason: m[2].trim() }),
    description: "File a dispute (e.g. 'dispute order-123: damaged goods')",
  },

  // Auctions & bidding
  {
    pattern: /(?:place\s+)?bid\s+(?:on\s+)?([a-z0-9-]+)\s+(?:for\s+)?\$?([\d,]+(?:\.\d+)?)/i,
    tool: "auction.place_auction_bid",
    buildArgs: (m) => ({
      lot_id: m[1].trim(),
      amount: parseFloat(m[2].replace(/,/g, "")),
    }),
    description: "Place a bid on an auction lot",
  },

  // Escrow
  {
    pattern: /create\s+escrow\s+(?:for\s+)?(?:order\s+)?([a-z0-9-]+)/i,
    tool: "escrow.create_escrow",
    buildArgs: (m) => ({ order_id: m[1].trim() }),
    description: "Create an escrow for an order",
  },
  {
    pattern: /check\s+escrow\s+([a-z0-9-]+)/i,
    tool: "escrow.get_escrow",
    buildArgs: (m) => ({ escrow_id: m[1].trim() }),
    description: "Check escrow status",
  },
];

const SUGGESTION_HINTS = [
  "search for copper scrap",
  "create listing for aluminum HMS",
  "check wallet",
  "check KYC status",
  "dashboard stats",
  "calculate tax for $5000 ON BC",
  "shipping quotes",
  "market prices for copper",
  "my listings",
  "transaction history",
  "my bookings",
  "my contracts",
  "place bid on lot-123 for $2500",
  "create escrow for order-456",
  "check escrow escrow-789",
  "file dispute for order-abc: damaged goods",
  "book inspection for listing-xyz",
  "check messages",
  "check notifications",
  "revenue report",
  "check credit",
  "start KYC verification",
  "track shipment ship-001",
];

type RequestBody = {
  message: string;
  context?: Record<string, unknown>;
  token?: string;
};

export async function POST(req: NextRequest) {
  const { message, context, token } = (await req.json()) as RequestBody;
  const trimmed = message.trim();

  for (const { pattern, tool, buildArgs } of TOOL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const args = buildArgs(match, trimmed);

      const mcpRes = await fetch(
        `${req.nextUrl.origin}/api/mcp`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tool, args, token }),
        },
      );

      const data = (await mcpRes.json()) as unknown;

      return NextResponse.json({
        content: `Called \`${tool}\` successfully.`,
        tool_call: { tool, args, result: data },
      });
    }
  }

  // No match — return helpful suggestion
  const sample = SUGGESTION_HINTS.slice(0, 6)
    .map((h) => `• "${h}"`)
    .join("\n");

  return NextResponse.json({
    content: `I didn't understand "${trimmed}". Here are some things you can ask:\n${sample}\n\nFor a full list of commands, type "help".`,
    tool_call: null,
  });
}
