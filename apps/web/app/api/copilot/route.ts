import { NextRequest, NextResponse } from "next/server";

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

type CopilotRequest = {
  message: string;
  context?: Record<string, unknown>;
  token?: string;
};

type ToolIntent = {
  tool: string;
  args: Record<string, unknown>;
  description: string;
};

const TOOL_PATTERNS: Array<{ pattern: RegExp; resolve: (match: RegExpMatchArray, ctx: Record<string, unknown>) => ToolIntent }> = [
  {
    pattern: /(?:search|find|look\s*for)\s+(.+?)(?:\s+listing|\s+material|\s+lot)?$/i,
    resolve: (m) => ({ tool: "search.search_materials", args: { query: m[1]!.trim() }, description: `Searching for "${m[1]!.trim()}"` }),
  },
  {
    pattern: /(?:create|new|add)\s+listing\s+(?:for\s+)?(.+)/i,
    resolve: (m, ctx) => ({
      tool: "listing.create_listing",
      args: { seller_id: String(ctx.user_id ?? ""), title: m[1]!.trim(), description: "Created via copilot", quantity: 10, unit: "kg", price_type: "fixed", asking_price: 1000 },
      description: `Creating listing: "${m[1]!.trim()}"`,
    }),
  },
  {
    pattern: /(?:publish)\s+listing\s+([a-f0-9-]+)/i,
    resolve: (m) => ({ tool: "listing.publish_listing", args: { listing_id: m[1]!.trim() }, description: `Publishing listing ${m[1]!.trim()}` }),
  },
  {
    pattern: /(?:check|get|show)\s+(?:my\s+)?(?:wallet|balance)/i,
    resolve: (_m, ctx) => ({ tool: "payments.get_wallet_balance", args: { user_id: String(ctx.user_id ?? "") }, description: "Checking wallet balance" }),
  },
  {
    pattern: /(?:check|get|show)\s+(?:kyc|verification)\s+(?:level|status)/i,
    resolve: (_m, ctx) => ({ tool: "kyc.get_kyc_level", args: { user_id: String(ctx.user_id ?? "") }, description: "Checking KYC level" }),
  },
  {
    pattern: /(?:check|get|show)\s+(?:credit|credit\s+facility)/i,
    resolve: (_m, ctx) => ({ tool: "credit.get_credit_facility", args: { user_id: String(ctx.user_id ?? "") }, description: "Checking credit facility" }),
  },
  {
    pattern: /(?:get|show)\s+(?:dashboard|stats|overview|platform)/i,
    resolve: () => ({ tool: "analytics.get_dashboard_stats", args: {}, description: "Fetching platform dashboard stats" }),
  },
  {
    pattern: /(?:get|show)\s+(?:revenue|report)/i,
    resolve: () => ({ tool: "analytics.get_revenue_report", args: { period: "30d" }, description: "Fetching 30-day revenue report" }),
  },
  {
    pattern: /(?:calculate|compute)\s+tax\s+(?:for\s+)?(?:\$?([\d,.]+))\s+(?:from\s+)?(\w{2})\s+(?:to\s+)?(\w{2})/i,
    resolve: (m) => ({
      tool: "tax.calculate_tax",
      args: { subtotal: Number(m[1]!.replace(/,/g, "")), seller_province: m[2]!.toUpperCase(), buyer_province: m[3]!.toUpperCase() },
      description: `Calculating tax for $${m[1]} (${m[2]!.toUpperCase()} → ${m[3]!.toUpperCase()})`,
    }),
  },
  {
    pattern: /(?:get|show|check)\s+(?:carrier\s+)?quotes?\s+(?:for\s+)?(?:order\s+)?([a-f0-9-]*)/i,
    resolve: (m) => ({ tool: "logistics.get_quotes", args: { order_id: m[1]?.trim() || undefined }, description: "Getting carrier shipping quotes" }),
  },
  {
    pattern: /(?:send|create)\s+notification\s+(?:to\s+)?([a-f0-9-]+)\s*[:\-]?\s*(.+)/i,
    resolve: (m) => ({
      tool: "notifications.send_notification",
      args: { user_id: m[1]!.trim(), type: "copilot.message", title: "Copilot notification", body: m[2]!.trim(), channels: ["in_app"], priority: "normal" },
      description: `Sending notification to ${m[1]!.trim().slice(0, 8)}...`,
    }),
  },
  {
    pattern: /(?:get|show|check|list)\s+(?:my\s+)?(?:unread\s+)?(?:messages|threads|inbox)/i,
    resolve: (_m, ctx) => ({ tool: "messaging.get_unread", args: { user_id: String(ctx.user_id ?? "") }, description: "Checking unread messages" }),
  },
  {
    pattern: /(?:get|show|list)\s+(?:my\s+)?(?:notifications)/i,
    resolve: (_m, ctx) => ({ tool: "notifications.get_notifications", args: { user_id: String(ctx.user_id ?? "") }, description: "Fetching notifications" }),
  },
  {
    pattern: /(?:get|check)\s+(?:market\s+)?(?:price|prices)\s+(?:for\s+)?(.+)/i,
    resolve: (m) => ({ tool: "pricing.get_market_prices", args: { material: m[1]!.trim() }, description: `Getting market prices for ${m[1]!.trim()}` }),
  },
  {
    pattern: /(?:get|show|list)\s+(?:my\s+)?(?:listings)/i,
    resolve: (_m, ctx) => ({ tool: "listing.get_my_listings", args: { seller_id: String(ctx.user_id ?? "") }, description: "Fetching your listings" }),
  },
  {
    pattern: /(?:get|show)\s+(?:my\s+)?(?:transactions|payment\s+history)/i,
    resolve: (_m, ctx) => ({ tool: "payments.get_transaction_history", args: { user_id: String(ctx.user_id ?? "") }, description: "Fetching transaction history" }),
  },
  {
    pattern: /(?:get|show)\s+(?:my\s+)?(?:bookings|schedule)/i,
    resolve: (_m, ctx) => ({ tool: "booking.list_user_bookings", args: { user_id: String(ctx.user_id ?? "") }, description: "Fetching your bookings" }),
  },
  {
    pattern: /(?:get|show)\s+(?:my\s+)?(?:contracts)/i,
    resolve: (_m, ctx) => ({ tool: "contracts.get_contract", args: { user_id: String(ctx.user_id ?? "") }, description: "Fetching your contracts" }),
  },
  {
    pattern: /(?:file|open|start)\s+(?:a\s+)?dispute\s+(?:for\s+)?(?:order\s+)?([a-f0-9-]+)\s*[:\-]?\s*(.+)?/i,
    resolve: (m, ctx) => ({
      tool: "dispute.file_dispute",
      args: { order_id: m[1]!.trim(), filing_party_id: String(ctx.user_id ?? ""), responding_party_id: String(ctx.user_id ?? ""), category: "quality", description: m[2]?.trim() || "Dispute filed via copilot" },
      description: `Filing dispute for order ${m[1]!.trim().slice(0, 8)}...`,
    }),
  },
];

function matchIntent(message: string, context: Record<string, unknown>): ToolIntent | null {
  for (const { pattern, resolve } of TOOL_PATTERNS) {
    const match = message.match(pattern);
    if (match) return resolve(match, context);
  }
  return null;
}

async function callGateway(tool: string, args: Record<string, unknown>, token?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${GATEWAY_URL}/tool`, { method: "POST", headers, body: JSON.stringify({ tool, args }) });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { status: response.status, body: { raw: text } };
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CopilotRequest;
  const message = String(body.message ?? "").trim();
  const context = body.context ?? {};
  const token = body.token;

  if (!message) {
    return NextResponse.json({
      role: "assistant",
      content: "I didn't catch that. Try something like:\n- \"search copper wire\"\n- \"check my wallet\"\n- \"get dashboard stats\"\n- \"calculate tax for $22495 ON ON\"",
      tool_call: null,
    });
  }

  const intent = matchIntent(message, context);

  if (!intent) {
    return NextResponse.json({
      role: "assistant",
      content: `I understand you said: "${message}"\n\nI can help with:\n- Search materials\n- Create/publish listings\n- Check wallet, KYC, credit\n- Get dashboard stats or revenue\n- Calculate tax\n- Get shipping quotes\n- File disputes\n- Send notifications\n- Check messages, bookings, contracts\n\nTry rephrasing your request.`,
      tool_call: null,
    });
  }

  const result = await callGateway(intent.tool, intent.args, token ?? undefined);

  return NextResponse.json({
    role: "assistant",
    content: intent.description,
    tool_call: {
      tool: intent.tool,
      args: intent.args,
      status: result.status,
      response: result.body,
    },
  });
}
