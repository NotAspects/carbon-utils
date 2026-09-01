import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC = ["/login"];

const ADMIN_IDS = new Set(
  (process.env.ADMIN_DISCORD_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (path.startsWith("/api") || path.startsWith("/_next") || path.includes(".")) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const allowed = Boolean(token?.sub && (ADMIN_IDS.size === 0 || ADMIN_IDS.has(token.sub)));

  if (PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) {
    if (token && allowed && path === "/login") {
      return NextResponse.redirect(new URL("/accounts", req.url));
    }
    return NextResponse.next();
  }

  if (!token?.sub) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (ADMIN_IDS.size > 0 && !ADMIN_IDS.has(token.sub)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
