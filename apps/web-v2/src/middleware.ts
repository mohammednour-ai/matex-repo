import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyMatexJwt } from "@/lib/jwt-edge";

const PUBLIC_PREFIXES = [
  "/login",
  "/privacy",
  "/terms",
  "/api/auth",
  "/api/health",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets and API routes (except /api/auth) handle their own auth
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Explicitly public pages
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // P1-10b — full JWT verification on the edge. Previously the middleware
  // only checked cookie presence; an expired or forged token got past until
  // the API layer 401s. Now we verify signature + exp here.
  const session = request.cookies.get("matex_session");
  const token = session?.value ?? "";
  if (!token) return redirectToLogin(request);

  const claims = await verifyMatexJwt(token);
  if (!claims) {
    // Bad / expired token. Clear the cookie so the next request doesn't
    // re-enter this branch and the browser can write a fresh one after
    // re-auth.
    const res = redirectToLogin(request);
    res.cookies.set("matex_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return res;
  }

  // Forward verified identity to downstream Node routes (e.g.
  // /api/dashboard/seed). They can still decode locally, but having the
  // header here saves a round trip when it's all they need.
  const res = NextResponse.next();
  res.headers.set("x-matex-user-id", claims.sub);
  if (claims.role) res.headers.set("x-matex-role", claims.role);
  return res;
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  // Preserve the original path so login can bounce back after re-auth.
  if (request.nextUrl.pathname !== "/login") {
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.mp4|.*\\.webp|.*\\.gif|.*\\.ico).*)",
  ],
};
