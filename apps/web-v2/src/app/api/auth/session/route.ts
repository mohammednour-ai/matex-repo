import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "matex_session";
const ONE_WEEK = 60 * 60 * 24 * 7;

// POST /api/auth/session — set HTTP-only session cookie after successful login
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const token = body?.token as string | undefined;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONE_WEEK,
    path: "/",
  });
  return res;
}

// DELETE /api/auth/session — clear the session cookie on sign-out
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
