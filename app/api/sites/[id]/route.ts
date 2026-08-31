import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/sites";

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const body = (await req.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const site = await prisma.site.update({
    where: { id: params.id },
    data: { name, slug: slugify(name) || undefined },
  });
  return NextResponse.json({ site });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  await prisma.site.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
