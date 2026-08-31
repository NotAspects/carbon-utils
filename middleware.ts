import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC = ["/login"];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (path.startsWith("/api") || path.startsWith("/_next") || path.includes(".")) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) {
    if (token && path === "/login") {
      return NextResponse.redirect(new URL("/accounts", req.url));
    }
    return NextResponse.next();
  }

  if (!token?.sub) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const adminIds = [
    ...(process.env.ADMIN_DISCORD_IDS || "").split(","),
    ...(process.env.NEXT_PUBLIC_ADMIN_DISCORD_IDS || "").split(","),
  ]
    .map((id) => id.trim())
    .filter(Boolean);

  if (adminIds.length > 0 && !adminIds.includes(token.sub)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("denied", "1");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
