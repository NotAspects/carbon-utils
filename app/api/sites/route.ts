import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITES, slugify } from "@/lib/sites";

async function ensureDefaults() {
  await prisma.site.createMany({
    data: DEFAULT_SITES.map((s) => ({ slug: s.slug, name: s.name })),
    skipDuplicates: true,
  });
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  await ensureDefaults();

  const sites = await prisma.site.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { accounts: true } },
    },
  });

  const withStatus = await Promise.all(
    sites.map(async (site) => {
      const grouped = await prisma.account.groupBy({
        by: ["status"],
        where: { siteId: site.id },
        _count: { _all: true },
      });
      const byStatus: Record<string, number> = {};
      for (const g of grouped) byStatus[g.status] = g._count._all;
      return {
        id: site.id,
        slug: site.slug,
        name: site.name,
        createdAt: site.createdAt,
        total: site._count.accounts,
        active: byStatus.active ?? 0,
        used: byStatus.used ?? 0,
        banned: byStatus.banned ?? 0,
        inactive: byStatus.inactive ?? 0,
      };
    })
  );

  return NextResponse.json({ sites: withStatus });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const body = (await req.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  let slug = slugify(name);
  if (!slug) slug = `site-${Date.now()}`;

  const existing = await prisma.site.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "A site with this name already exists" }, { status: 409 });
  }

  const site = await prisma.site.create({ data: { name, slug } });
  return NextResponse.json({ site });
}
