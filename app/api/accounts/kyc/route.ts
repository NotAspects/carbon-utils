import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accountMatchesKyc, isTicketmasterSlug, parseKycKeys } from "@/lib/sites";

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const body = (await req.json()) as { text?: string; siteId?: string };
  const parsed = parseKycKeys(body.text ?? "");
  const keys = { logins: new Set(parsed.logins), phones: new Set(parsed.phones) };
  if (keys.logins.size === 0 && keys.phones.size === 0) {
    return NextResponse.json({ error: "no emails or phones in KYC CSV" }, { status: 400 });
  }

  const sites = await prisma.site.findMany({
    where: body.siteId?.trim() ? { id: body.siteId.trim() } : { slug: { startsWith: "ticketmaster" } },
    select: { id: true, slug: true },
  });
  const tm = sites.filter((s) => isTicketmasterSlug(s.slug));
  if (tm.length === 0) {
    return NextResponse.json({ error: "no Ticketmaster site found" }, { status: 404 });
  }

  const accounts = await prisma.account.findMany({
    where: { siteId: { in: tm.map((s) => s.id) } },
    select: { id: true, login: true, phone: true },
  });

  const ids = accounts.filter((a) => accountMatchesKyc(a.login, a.phone, keys)).map((a) => a.id);
  if (ids.length === 0) {
    return NextResponse.json({ flagged: 0, scanned: accounts.length });
  }

  for (let i = 0; i < ids.length; i += 500) {
    await prisma.account.updateMany({
      where: { id: { in: ids.slice(i, i + 500) } },
      data: { status: "kyc" },
    });
  }

  return NextResponse.json({ flagged: ids.length, scanned: accounts.length });
}
