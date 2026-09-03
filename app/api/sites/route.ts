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

  const [sites, grouped] = await Promise.all([
    prisma.site.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, name: true, createdAt: true },
    }),
    prisma.account.groupBy({
      by: ["siteId", "status"],
      _count: { _all: true },
    }),
  ]);

  const bySite: Record<string, Record<string, number>> = {};
  for (const g of grouped) {
    (bySite[g.siteId] ??= {})[g.status] = g._count._all;
  }

  return NextResponse.json(
    {
      sites: sites.filter((site) => site.slug !== "outlook").map((site) => {
        const byStatus = bySite[site.id] ?? {};
        const active = byStatus.active ?? 0;
        const used = byStatus.used ?? 0;
        const banned = byStatus.banned ?? 0;
        const inactive = byStatus.inactive ?? 0;
        const kyc = byStatus.kyc ?? 0;
        return {
          id: site.id,
          slug: site.slug,
          name: site.name,
          createdAt: site.createdAt,
          total: active + used + banned + inactive + kyc,
          active,
          used,
          banned,
          inactive,
          kyc,
        };
      }),
    },
    { headers: { "Cache-Control": "private, max-age=15" } }
  );
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
