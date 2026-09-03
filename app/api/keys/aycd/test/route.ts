import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { testAycdConnection } from "@/lib/aycdInbox";

export const maxDuration = 30;

export async function POST() {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const result = await testAycdConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
