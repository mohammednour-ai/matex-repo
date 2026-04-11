import { NextRequest, NextResponse } from "next/server";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

type Body = {
  tool: string;
  args?: Record<string, unknown>;
  token?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (body.token) {
    headers.authorization = `Bearer ${body.token}`;
  }

  try {
    const r = await fetch(`${GATEWAY}/tool`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: body.tool, args: body.args ?? {} }),
    });

    return new NextResponse(await r.text(), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message =
      err instanceof Error && err.cause && (err.cause as NodeJS.ErrnoException).code === "ECONNREFUSED"
        ? "MCP Gateway is not reachable. Make sure it is running on " + GATEWAY
        : err instanceof Error
          ? err.message
          : "Unknown gateway error";

    return NextResponse.json(
      { success: false, error: { code: "GATEWAY_UNREACHABLE", message } },
      { status: 502 },
    );
  }
}
