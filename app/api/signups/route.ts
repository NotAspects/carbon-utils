import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Sites de sign-ups : tout site dont le slug se termine par "-signups"
async function signupSites() {
  const sites = await prisma.site.findMany({
    where: { slug: { endsWith: "-signups" } },
    orderBy: { name: "asc" },
    include: { _count: { select: { accounts: true } } },
  });
  return sites;
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const siteSlug = req.nextUrl.searchParams.get("site");
  if (!siteSlug) {
    const sites = await signupSites();
    return NextResponse.json(
      { sites: sites.map((s) => ({ id: s.id, slug: s.slug, name: s.name, total: s._count.accounts })) },
      { headers: { "Cache-Control": "private, max-age=15" } },
    );
  }

  const site = await prisma.site.findUnique({ where: { slug: siteSlug } });
  if (!site) return NextResponse.json({ error: "site not found" }, { status: 404 });

  const accounts = await prisma.account.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, login: true, notes: true, createdAt: true },
  });
  return NextResponse.json(
    { site: { slug: site.slug, name: site.name }, accounts },
    { headers: { "Cache-Control": "private, max-age=15" } },
  );
}
