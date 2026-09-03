import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { aycdBox } from "@/lib/aycdInbox";
import { loadImapBoxes } from "@/lib/inboxBoxes";

export async function GET() {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const [boxes, aycd] = await Promise.all([loadImapBoxes(), aycdBox()]);
  const mailboxes = [
    ...boxes.map((b) => ({ id: b.id, name: b.name, email: b.email })),
    ...(aycd ? [{ id: aycd.id, name: aycd.name, email: aycd.email }] : []),
  ];
  return NextResponse.json({ mailboxes }, { headers: { "Cache-Control": "private, max-age=15" } });
}
