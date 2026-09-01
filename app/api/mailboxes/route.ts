import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { MAILBOX_CATALOG } from "@/lib/mailboxes";
import { prisma } from "@/lib/prisma";

let seeded = false;

async function ensureDefaults() {
  if (seeded) return;
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
  seeded = true;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  await ensureDefaults();

  const mailboxes = await prisma.mailbox.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { accounts: true } } },
  });

  return NextResponse.json(
    {
      mailboxes: mailboxes.map((box) => ({
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
        active: box._count.accounts,
        used: 0,
        banned: 0,
        inactive: 0,
      })),
    },
    { headers: { "Cache-Control": "private, max-age=15" } }
  );
}
