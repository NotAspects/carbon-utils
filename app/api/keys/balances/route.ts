import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { API_PROVIDERS } from "@/lib/apiProviders";
import { fetchProviderBalance } from "@/lib/providerBalances";

type BalancesPayload = {
  balances: Awaited<ReturnType<typeof fetchProviderBalance>>[];
};

let cached: { at: number; data: BalancesPayload } | null = null;
const TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  }

  const keys = await prisma.apiKey.findMany({
    select: { slug: true, apiKey: true },
  });
  const results = await Promise.all(
    keys.map(async (k) => {
      const def = API_PROVIDERS.find((p) => p.slug === k.slug);
      if (!def?.balance) {
        return { slug: k.slug, amount: null, currency: null, error: null, unsupported: true };
      }
      if (!k.apiKey.trim()) {
        return { slug: k.slug, amount: null, currency: null, error: "empty key", unsupported: false };
      }
      return fetchProviderBalance(k.slug, k.apiKey);
    })
  );

  const data = { balances: results };
  cached = { at: Date.now(), data };
  return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
}
