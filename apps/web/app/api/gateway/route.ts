import { NextRequest, NextResponse } from "next/server";

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

type ToolBody = {
  tool: string;
  args?: Record<string, unknown>;
  token?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ToolBody;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (body.token) headers.authorization = `Bearer ${body.token}`;

  const response = await fetch(`${GATEWAY_URL}/tool`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tool: body.tool, args: body.args ?? {} }),
  });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}
