import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const body = (await req.json()) as {
    name?: string;
    email?: string;
    host?: string;
    port?: number;
    password?: string | null;
    kind?: string;
    domain?: string | null;
    notes?: string | null;
  };

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.email === "string") data.email = body.email.trim();
  if (typeof body.host === "string") data.host = body.host.trim();
  if (body.port != null) data.port = Number(body.port) || 993;
  if ("password" in body) data.password = body.password?.trim() || null;
  if (body.kind === "forward" || body.kind === "catchall") data.kind = body.kind;
  if ("domain" in body) data.domain = body.domain?.trim() || null;
  if ("notes" in body) data.notes = body.notes?.trim() || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const mailbox = await prisma.mailbox.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ mailbox });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  await prisma.mailbox.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
