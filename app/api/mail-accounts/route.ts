import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseMailLines } from "@/lib/mailboxes";

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const mailboxId = req.nextUrl.searchParams.get("mailboxId");
  if (!mailboxId) return NextResponse.json({ error: "mailboxId required" }, { status: 400 });

  const accounts = await prisma.mailAccount.findMany({
    where: { mailboxId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ accounts }, { headers: { "Cache-Control": "private, max-age=8" } });
}

export async function PUT(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const body = (await req.json()) as { mailboxId?: string; text?: string };
  const mailboxId = body.mailboxId?.trim();
  if (!mailboxId) return NextResponse.json({ error: "mailboxId required" }, { status: 400 });

  const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mailbox) return NextResponse.json({ error: "mailbox not found" }, { status: 404 });

  const emails = parseMailLines(body.text ?? "");

  await prisma.$transaction([
    prisma.mailAccount.deleteMany({ where: { mailboxId } }),
    prisma.mailAccount.createMany({
      data: emails.map((login) => ({ mailboxId, login, status: "active" })),
    }),
  ]);

  return NextResponse.json({ count: emails.length });
}
