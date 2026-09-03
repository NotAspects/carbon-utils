import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { API_PROVIDERS } from "@/lib/apiProviders";
import { slugify } from "@/lib/sites";

let seeded = false;

async function ensureCatalog() {
  if (seeded) return;
  await prisma.apiKey.createMany({
    data: API_PROVIDERS.map((p) => ({
      group: p.group,
      slug: p.slug,
      name: p.name,
      apiKey: "",
    })),
    skipDuplicates: true,
  });
  seeded = true;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return unauthorized();
  await ensureCatalog();
  const keys = await prisma.apiKey.findMany({ orderBy: [{ group: "asc" }, { name: "asc" }] });
  return NextResponse.json({ keys }, { headers: { "Cache-Control": "private, max-age=15" } });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();
  const body = (await req.json()) as { group?: string; name?: string; apiKey?: string };
  if (body.group !== "aycd") {
    return NextResponse.json({ error: "only AYCD keys can be created" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const apiKey = body.apiKey?.trim() ?? "";
  if (!apiKey) return NextResponse.json({ error: "api key required" }, { status: 400 });

  let slug = `aycd-${slugify(name) || "key"}`;
  const clash = await prisma.apiKey.findUnique({ where: { slug } });
  if (clash) slug = `${slug}-${Date.now().toString(36)}`;

  const key = await prisma.apiKey.create({
    data: { group: "aycd", slug, name, apiKey },
  });
  return NextResponse.json({ key });
}

export async function PATCH(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();
  const body = (await req.json()) as { slug?: string; apiKey?: string };
  const slug = body.slug?.trim();
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const key = await prisma.apiKey.update({
    where: { slug },
    data: { apiKey: body.apiKey?.trim() ?? "" },
  });
  return NextResponse.json({ key });
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();
  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const existing = await prisma.apiKey.findUnique({ where: { slug } });
  if (!existing || existing.group !== "aycd") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await prisma.apiKey.delete({ where: { slug } });
  return NextResponse.json({ ok: true });
}
