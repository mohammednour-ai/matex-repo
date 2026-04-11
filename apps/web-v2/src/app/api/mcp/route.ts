import { NextRequest, NextResponse } from "next/server";

/** Server-side URL (read at request time; set on Railway without rebuild). */
function gatewayUrl(): string {
  const a = process.env.MCP_GATEWAY_URL?.trim().replace(/\/$/, "") ?? "";
  if (a) return a;
  const b = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim().replace(/\/$/, "") ?? "";
  if (b) return b;
  return "http://localhost:3001";
}

function gatewayUnreachableMessage(url: string): string {
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const base = `MCP Gateway is not reachable at ${url}.`;
  if (isLocal) {
    return `${base} Start it locally (e.g. pnpm dev:gateway or pnpm dev:web-v2-stack), or set MCP_GATEWAY_URL / NEXT_PUBLIC_GATEWAY_URL to your deployed gateway (e.g. https://your-gateway.up.railway.app).`;
  }
  return `${base} Confirm the gateway service is running and MCP_GATEWAY_URL matches its public HTTPS origin (no trailing slash).`;
}

type Body = {
  tool: string;
  args?: Record<string, unknown>;
  token?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const gateway = gatewayUrl();

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (body.token) {
    headers.authorization = `Bearer ${body.token}`;
  }

  try {
    const r = await fetch(`${gateway}/tool`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: body.tool, args: body.args ?? {} }),
    });

    return new NextResponse(await r.text(), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const isConnRefused =
      err instanceof Error &&
      err.cause &&
      (err.cause as NodeJS.ErrnoException).code === "ECONNREFUSED";
    const message =
      isConnRefused || (err instanceof Error && err.message.includes("fetch failed"))
        ? gatewayUnreachableMessage(gateway)
        : err instanceof Error
          ? err.message
          : "Unknown gateway error";

    return NextResponse.json(
      { success: false, error: { code: "GATEWAY_UNREACHABLE", message } },
      { status: 502 },
    );
  }
}
