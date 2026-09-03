import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { groupOutlookAccounts, parseMailEntries } from "@/lib/mailboxes";

export const maxDuration = 60;

async function mergeEntries(
  mailboxId: string,
  text: string
): Promise<{ added: number; total: number }> {
  const emails = parseMailEntries(text);
  const existing = await prisma.mailAccount.findMany({
    where: { mailboxId },
    select: { login: true },
  });
  const have = new Set(existing.map((a) => a.login.toLowerCase()));
  const fresh = emails.filter((e) => e.login.trim() && !have.has(e.login.toLowerCase()));

  for (let i = 0; i < fresh.length; i += 500) {
    await prisma.mailAccount.createMany({
      data: fresh.slice(i, i + 500).map((r) => ({
        mailboxId,
        login: r.login,
        password: r.password,
        notes: r.notes,
        status: "active",
      })),
    });
  }

  return { added: fresh.length, total: existing.length + fresh.length };
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const mailboxId = req.nextUrl.searchParams.get("mailboxId");
  if (!mailboxId) return NextResponse.json({ error: "mailboxId required" }, { status: 400 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
  const where = {
    mailboxId,
    ...(q
      ? { login: { contains: q, mode: "insensitive" as const } }
      : {}),
  };

  if (req.nextUrl.searchParams.get("grouped") === "1") {
    const rows = await prisma.mailAccount.findMany({
      where: { mailboxId },
      select: { id: true, login: true, password: true, notes: true, status: true },
    });
    const needle = q.toLowerCase();
    let groups = groupOutlookAccounts(rows);
    if (needle) {
      groups = groups.filter(
        (g) =>
          g.account.login.toLowerCase().includes(needle) ||
          g.aliases.some((a) => a.login.toLowerCase().includes(needle))
      );
    }
    const limit = Math.min(200, Math.max(1, Number(limitRaw) || 80));
    const sliced = groups.slice(offset, offset + limit);
    return NextResponse.json(
      {
        groups: sliced,
        total: rows.length,
        groupTotal: groups.length,
        accounts: groups.length,
        aliases: groups.reduce((sum, g) => sum + g.aliases.length, 0),
      },
      { headers: { "Cache-Control": "private, max-age=8" } }
    );
  }

  if (limitRaw != null) {
    const limit = Math.min(500, Math.max(1, Number(limitRaw) || 80));
    const [accounts, total] = await Promise.all([
      prisma.mailAccount.findMany({
        where,
        orderBy: { login: "asc" },
        skip: offset,
        take: limit,
        select: { id: true, login: true, password: true, notes: true, status: true },
      }),
      prisma.mailAccount.count({ where }),
    ]);
    return NextResponse.json(
      { accounts, total },
      { headers: { "Cache-Control": "private, max-age=8" } }
    );
  }

  const accounts = await prisma.mailAccount.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    { accounts, total: accounts.length },
    { headers: { "Cache-Control": "private, max-age=8" } }
  );
}

export async function PUT(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const body = (await req.json()) as { mailboxId?: string; text?: string };
  const mailboxId = body.mailboxId?.trim();
  if (!mailboxId) return NextResponse.json({ error: "mailboxId required" }, { status: 400 });

  const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mailbox) return NextResponse.json({ error: "mailbox not found" }, { status: 404 });

  const emails = parseMailEntries(body.text ?? "");

  await prisma.$transaction([
    prisma.mailAccount.deleteMany({ where: { mailboxId } }),
    prisma.mailAccount.createMany({
      data: emails.map((r) => ({
        mailboxId,
        login: r.login,
        password: r.password,
        notes: r.notes,
        status: "active",
      })),
    }),
  ]);

  return NextResponse.json({ count: emails.length });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const body = (await req.json()) as { mailboxId?: string; text?: string };
  const mailboxId = body.mailboxId?.trim();
  if (!mailboxId) return NextResponse.json({ error: "mailboxId required" }, { status: 400 });

  const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mailbox) return NextResponse.json({ error: "mailbox not found" }, { status: 404 });

  const result = await mergeEntries(mailboxId, body.text ?? "");
  return NextResponse.json(result);
}
