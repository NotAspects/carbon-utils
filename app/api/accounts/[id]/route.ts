import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_STATUSES, type AccountStatus } from "@/lib/sites";

type Ctx = { params: { id: string } };

function isStatus(v: unknown): v is AccountStatus {
  return typeof v === "string" && (ACCOUNT_STATUSES as readonly string[]).includes(v);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const body = (await req.json()) as {
    login?: string;
    password?: string | null;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    birthDate?: string | null;
    notes?: string | null;
    status?: string;
  };

  const data: Record<string, unknown> = {};
  if (typeof body.login === "string") data.login = body.login.trim();
  if ("password" in body) data.password = body.password?.trim() || null;
  if ("phone" in body) data.phone = body.phone?.trim() || null;
  if ("firstName" in body) data.firstName = body.firstName?.trim() || null;
  if ("lastName" in body) data.lastName = body.lastName?.trim() || null;
  if ("birthDate" in body) data.birthDate = body.birthDate?.trim() || null;
  if ("notes" in body) data.notes = body.notes?.trim() || null;
  if (isStatus(body.status)) data.status = body.status;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const account = await prisma.account.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ account });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  await prisma.account.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
