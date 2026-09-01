import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { MAILBOX_CATALOG } from "@/lib/mailboxes";
import { prisma } from "@/lib/prisma";

async function ensureDefaults() {
  await prisma.mailbox.createMany({
    data: MAILBOX_CATALOG.map((m) => ({
      slug: m.slug,
      name: m.name,
      email: m.email,
      host: m.host,
      port: m.port,
      kind: m.kind,
      domain: m.domain ?? null,
    })),
    skipDuplicates: true,
  });
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  await ensureDefaults();

  const mailboxes = await prisma.mailbox.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { accounts: true } } },
  });

  const withStatus = await Promise.all(
    mailboxes.map(async (box) => {
      const grouped = await prisma.mailAccount.groupBy({
        by: ["status"],
        where: { mailboxId: box.id },
        _count: { _all: true },
      });
      const byStatus: Record<string, number> = {};
      for (const g of grouped) byStatus[g.status] = g._count._all;
      return {
        id: box.id,
        slug: box.slug,
        name: box.name,
        email: box.email,
        host: box.host,
        port: box.port,
        password: box.password,
        kind: box.kind,
        domain: box.domain,
        notes: box.notes,
        total: box._count.accounts,
        active: byStatus.active ?? 0,
        used: byStatus.used ?? 0,
        banned: byStatus.banned ?? 0,
        inactive: byStatus.inactive ?? 0,
      };
    })
  );

  return NextResponse.json({ mailboxes: withStatus });
}
