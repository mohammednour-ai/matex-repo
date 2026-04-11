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

  // Pricing (listing workflow)
  {
    pattern: /market\s+prices?\s+(?:for\s+)?(.+)/i,
    tool: "pricing.get_market_prices",
    buildArgs: (m) => ({ material: m[1].trim() }),
    description: "Get market prices for a material",
  },
  {
    pattern: /^(?:commodity|index)\s+price\s+for\s+(.+)/i,
    tool: "pricing.get_market_prices",
    buildArgs: (m) => ({ material: m[1].trim() }),
    description: "Commodity / index price lookup",
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

const LISTING_CREATE_HINTS = [
  "market prices for copper",
  "commodity price for aluminum",
  "my listings",
  "calculate tax for $5000 ON ON",
  "dashboard stats",
  "shipping quotes",
  "show my draft",
  "book inspection for listing-xyz",
];

type RequestBody = {
  message: string;
  context?: Record<string, unknown>;
  token?: string;
};

function tryContextualTool(
  trimmed: string,
  context: Record<string, unknown> | undefined,
): { tool: string; args: Record<string, unknown> } | null {
  const lid =
    typeof context?.listing_id === "string" ? context.listing_id.trim() : "";
  if (!lid) return null;

  if (/^(show my draft|draft listing details|get this listing)$/i.test(trimmed)) {
    return { tool: "listing.get_listing", args: { listing_id: lid } };
  }
  if (/^book inspection for this listing$/i.test(trimmed)) {
    return { tool: "inspection.request_inspection", args: { listing_id: lid } };
  }
  return null;
}

function summarizeToolResult(tool: string, payload: unknown): string {
  const p = payload as { success?: boolean } | null;
  const ok = p == null || typeof p !== "object" || p.success !== false;

  if (!ok) {
    return `MCP returned an error for \`${tool}\`. See the tool badge below for details.`;
  }
  switch (tool) {
    case "pricing.get_market_prices":
      return `Pulled market pricing via MCP (\`${tool}\`).`;
    case "listing.get_listing":
      return `Loaded listing data via \`${tool}\`.`;
    case "listing.get_my_listings":
      return `Fetched your listings through \`${tool}\`.`;
    case "listing.create_listing":
      return `Listing create tool invoked (\`${tool}\`).`;
    case "search.search_materials":
      return `Searched the marketplace via \`${tool}\`.`;
    case "tax.calculate_tax":
      return `Tax calculation completed (\`${tool}\`).`;
    case "analytics.get_dashboard_stats":
      return `Dashboard stats loaded via \`${tool}\`.`;
    case "inspection.request_inspection":
      return `Inspection request sent via \`${tool}\`.`;
    default:
      return `Completed \`${tool}\` via the MCP gateway.`;
  }
}

async function runTool(
  req: NextRequest,
  tool: string,
  args: Record<string, unknown>,
  token: string | undefined,
) {
  const mcpRes = await fetch(`${req.nextUrl.origin}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, args, token }),
  });

  const data = (await mcpRes.json()) as unknown;

  return NextResponse.json({
    content: summarizeToolResult(tool, data),
    tool_call: { tool, args, result: data },
  });
}

export async function POST(req: NextRequest) {
  const { message, context, token } = (await req.json()) as RequestBody;
  const trimmed = message.trim();

  const ctx = context && typeof context === "object" ? context : undefined;
  const contextual = tryContextualTool(trimmed, ctx);
  if (contextual) {
    return runTool(req, contextual.tool, contextual.args, token);
  }

  for (const { pattern, tool, buildArgs } of TOOL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const args = buildArgs(match, trimmed);
      return runTool(req, tool, args, token);
    }
  }

  const page = typeof ctx?.page === "string" ? ctx.page : "";
  const step = ctx?.step;
  const stepLabel =
    typeof step === "number" && step >= 1 && step <= 99 ? ` (step ${step})` : "";

  const hints =
    page === "listing-create" ? LISTING_CREATE_HINTS : SUGGESTION_HINTS;
  const sample = hints
    .slice(0, 6)
    .map((h) => `• "${h}"`)
    .join("\n");

  const prefix =
    page === "listing-create"
      ? `You're on **Create listing**${stepLabel}. Try:\n`
      : "";

  return NextResponse.json({
    content: `${prefix}I didn't understand "${trimmed}". Here are some things you can ask:\n${sample}\n\nFor more commands, open the full **Chat** page from the nav.`,
    tool_call: null,
  });
}
