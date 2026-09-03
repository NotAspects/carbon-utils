import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { AYCD_BOX_ID, listAycdInbox } from "@/lib/aycdInbox";
import { INBOX_PAGE_MAX, INBOX_PAGE_SIZE } from "@/lib/inboxLimits";
import { listMailbox } from "@/lib/imapInbox";
import { loadImapBoxes } from "@/lib/inboxBoxes";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const mailboxId = req.nextUrl.searchParams.get("mailboxId");
  if (!mailboxId) {
    return NextResponse.json({ error: "mailboxId required" }, { status: 400 });
  }

  const limit = Math.min(INBOX_PAGE_MAX, Math.max(20, Number(req.nextUrl.searchParams.get("limit")) || INBOX_PAGE_SIZE));
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
  const force = req.nextUrl.searchParams.get("force") === "1";

  if (mailboxId === AYCD_BOX_ID) {
    const data = await listAycdInbox(limit + offset);
    const items = data.items.slice(offset, offset + limit);
    return NextResponse.json(
      {
        items,
        error: data.error ?? null,
        hasMore: data.items.length > offset + items.length,
        mailbox: { id: AYCD_BOX_ID, name: "Outlook", email: "aycd" },
      },
      { headers: { "Cache-Control": force ? "no-store" : "private, max-age=20" } }
    );
  }

  const boxes = await loadImapBoxes(mailboxId);
  const box = boxes[0];
  if (!box) {
    return NextResponse.json({ items: [], error: "mailbox not found" }, { status: 404 });
  }

  try {
    const data = await listMailbox(box, limit, force, offset);
    return NextResponse.json(
      {
        items: data.items,
        error: data.error ?? null,
        hasMore: data.hasMore ?? false,
        mailbox: { id: box.id, name: box.name, email: box.email },
      },
      { headers: { "Cache-Control": force ? "no-store" : "private, max-age=20" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "inbox failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
