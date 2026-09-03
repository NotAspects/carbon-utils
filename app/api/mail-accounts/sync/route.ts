import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { MAILBOX_CATALOG } from "@/lib/mailboxes";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

async function findOutlookSiteId() {
  const named = await prisma.site.findMany({
    where: {
      OR: [
        { slug: { equals: "outlook", mode: "insensitive" } },
        { slug: { contains: "outlook", mode: "insensitive" } },
        { name: { contains: "outlook", mode: "insensitive" } },
      ],
    },
    select: { id: true, _count: { select: { accounts: true } } },
  });
  if (named.length) {
    return named.sort((a, b) => b._count.accounts - a._count.accounts)[0].id;
  }

  const hits = await prisma.$queryRaw<{ siteId: string; n: number }[]>`
    SELECT "siteId", COUNT(*)::int AS n
    FROM "Account"
    WHERE login ~* '@(outlook|hotmail|live|msn)\\.'
    GROUP BY "siteId"
    ORDER BY n DESC
    LIMIT 1
  `;
  return hits[0]?.siteId ?? null;
}

export async function POST() {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const seed = MAILBOX_CATALOG.find((m) => m.slug === "outlook");
  if (seed) {
    await prisma.mailbox.createMany({
      data: [
        {
          slug: seed.slug,
          name: seed.name,
          email: seed.email,
          host: seed.host,
          port: seed.port,
          kind: seed.kind,
          domain: seed.domain ?? null,
        },
      ],
      skipDuplicates: true,
    });
  }

  const mailbox = await prisma.mailbox.findUnique({ where: { slug: "outlook" } });
  if (!mailbox) {
    return NextResponse.json({ error: "Outlook mailbox not found" }, { status: 404 });
  }

  const siteId = await findOutlookSiteId();
  if (!siteId) {
    return NextResponse.json({ error: "Outlook site not found in Accounts" }, { status: 404 });
  }

  const [accounts, existing] = await Promise.all([
    prisma.account.findMany({
      where: { siteId },
      select: { login: true, password: true },
    }),
    prisma.mailAccount.findMany({
      where: { mailboxId: mailbox.id },
      select: { login: true },
    }),
  ]);

  const have = new Set(existing.map((a) => a.login.toLowerCase()));
  const fresh = accounts.filter((a) => a.login.trim() && !have.has(a.login.toLowerCase()));

  for (let i = 0; i < fresh.length; i += 500) {
    await prisma.mailAccount.createMany({
      data: fresh.slice(i, i + 500).map((a) => ({
        mailboxId: mailbox.id,
        login: a.login,
        password: a.password,
        status: "active",
      })),
    });
  }

  return NextResponse.json({
    added: fresh.length,
    total: existing.length + fresh.length,
    source: accounts.length,
  });
}
