import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Sites exclus du sélecteur "disponibles" : tout site ayant au moins un compte
// (catégories -signups + comptes réels type ticketmaster-*, seetickets, …)
async function signupSites() {
  return prisma.site.findMany({
    where: { accounts: { some: {} } },
    orderBy: { name: "asc" },
    include: { _count: { select: { accounts: true } } },
  });
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

  // `site` peut contenir plusieurs slugs séparés par des virgules
  const slugs = (siteSlug.split(",").map((s) => s.trim()).filter(Boolean));
  const sites = await prisma.site.findMany({ where: { slug: { in: slugs } } });
  if (!sites.length) return NextResponse.json({ error: "site not found" }, { status: 404 });

  const accounts = await prisma.account.findMany({
    where: { siteId: { in: sites.map((s) => s.id) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, login: true, notes: true, createdAt: true },
  });
  return NextResponse.json(
    { site: { slug: sites.map((s) => s.slug).join(","), name: sites.map((s) => s.name).join(", ") }, accounts },
    { headers: { "Cache-Control": "private, max-age=15" } },
  );
}

// Créer une catégorie de sign-ups, et/ou y ajouter des mails en masse
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const body = (await req.json()) as { name?: string; mails?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-signups";
  const site = await prisma.site.upsert({
    where: { slug },
    update: {},
    create: { slug, name },
  });

  let added = 0;
  if (body.mails?.trim()) {
    const seen = new Set<string>();
    const existing = new Set(
      (await prisma.account.findMany({ where: { siteId: site.id }, select: { login: true } })).map(
        (a) => a.login.toLowerCase(),
      ),
    );
    const rows = body.mails
      .split(/[\s,;]+/)
      .map((l) => l.trim())
      .filter((l) => l.includes("@"))
      .filter((l) => {
        const k = l.toLowerCase();
        if (seen.has(k) || existing.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((login) => ({ siteId: site.id, login, status: "active" }));
    if (rows.length) added = (await prisma.account.createMany({ data: rows })).count;
  }

  return NextResponse.json({ slug: site.slug, added });
}

// Supprimer une catégorie (les comptes sont supprimés en cascade)
export async function DELETE(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const siteSlug = req.nextUrl.searchParams.get("site");
  if (!siteSlug) return NextResponse.json({ error: "site required" }, { status: 400 });

  const site = await prisma.site.findUnique({ where: { slug: siteSlug } });
  if (!site) return NextResponse.json({ error: "site not found" }, { status: 404 });

  await prisma.site.delete({ where: { id: site.id } });
  return NextResponse.json({ deleted: site.slug });
}
