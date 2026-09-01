import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_STATUSES, parseAccountLines, type AccountStatus } from "@/lib/sites";

function isStatus(v: unknown): v is AccountStatus {
  return typeof v === "string" && (ACCOUNT_STATUSES as readonly string[]).includes(v);
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const accounts = await prisma.account.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      siteId: true,
      login: true,
      password: true,
      phone: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      notes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ accounts }, { headers: { "Cache-Control": "private, max-age=8" } });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const body = (await req.json()) as {
    siteId?: string;
    login?: string;
    password?: string | null;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    birthDate?: string | null;
    notes?: string | null;
    status?: string;
    bulk?: string;
    entries?: Array<{
      login?: string;
      password?: string | null;
      phone?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      birthDate?: string | null;
      notes?: string | null;
      status?: string;
    }>;
  };

  const siteId = body.siteId?.trim();
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return NextResponse.json({ error: "site not found" }, { status: 404 });

  const bulkRows =
    body.entries?.map((r) => ({
      login: (r.login ?? "").trim(),
      password: r.password?.trim() || null,
      phone: r.phone?.trim() || null,
      firstName: r.firstName?.trim() || null,
      lastName: r.lastName?.trim() || null,
      birthDate: r.birthDate?.trim() || null,
      notes: r.notes?.trim() || null,
      status: isStatus(r.status) ? r.status : "active",
    })).filter((r) => r.login) ??
    (body.bulk != null ? parseAccountLines(body.bulk).map((r) => ({ ...r, status: "active" as const })) : null);

  if (bulkRows) {
    if (bulkRows.length === 0) {
      return NextResponse.json({ error: "no valid accounts" }, { status: 400 });
    }
    const created = await prisma.account.createMany({
      data: bulkRows.map((r) => ({
        siteId,
        login: r.login,
        password: r.password,
        phone: r.phone,
        firstName: r.firstName,
        lastName: r.lastName,
        birthDate: r.birthDate,
        notes: r.notes,
        status: r.status ?? "active",
      })),
    });
    return NextResponse.json({ added: created.count });
  }

  const login = body.login?.trim();
  if (!login) return NextResponse.json({ error: "login required" }, { status: 400 });

  const status = isStatus(body.status) ? body.status : "active";
  const account = await prisma.account.create({
    data: {
      siteId,
      login,
      password: body.password?.trim() || null,
      phone: body.phone?.trim() || null,
      firstName: body.firstName?.trim() || null,
      lastName: body.lastName?.trim() || null,
      birthDate: body.birthDate?.trim() || null,
      notes: body.notes?.trim() || null,
      status,
    },
  });

  return NextResponse.json({ account });
}
