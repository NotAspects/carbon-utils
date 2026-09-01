import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { loadImapBoxes } from "@/lib/inboxBoxes";

export async function GET() {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const boxes = await loadImapBoxes();
  return NextResponse.json(
    { mailboxes: boxes.map((b) => ({ id: b.id, name: b.name, email: b.email })) },
    { headers: { "Cache-Control": "private, max-age=15" } }
  );
}
