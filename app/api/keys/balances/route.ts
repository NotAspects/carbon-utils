import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { API_PROVIDERS } from "@/lib/apiProviders";
import { fetchProviderBalance } from "@/lib/providerBalances";

export async function GET() {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const keys = await prisma.apiKey.findMany();
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

  return NextResponse.json({ balances: results });
}
