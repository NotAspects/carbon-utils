import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { API_PROVIDERS } from "@/lib/apiProviders";

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
  return NextResponse.json({ keys });
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
