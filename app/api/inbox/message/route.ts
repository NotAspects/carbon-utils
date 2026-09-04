import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { AYCD_BOX_ID, readAycdMessage } from "@/lib/aycdInbox";
import { readMessage } from "@/lib/imapInbox";
import { loadImapBoxes } from "@/lib/inboxBoxes";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return unauthorized();

  const mailboxId = req.nextUrl.searchParams.get("mailboxId");
  const uid = Number(req.nextUrl.searchParams.get("uid"));
  if (!mailboxId || !uid) {
    return NextResponse.json({ error: "mailboxId and uid required" }, { status: 400 });
  }

  if (mailboxId === AYCD_BOX_ID) {
    try {
      const message = await readAycdMessage(uid);
      if (!message) return NextResponse.json({ error: "message not found" }, { status: 404 });
      return NextResponse.json({ message }, { headers: { "Cache-Control": "private, max-age=60" } });
    } catch (e) {
      const message = e instanceof Error ? e.message : "read failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const boxes = await loadImapBoxes(mailboxId);
  const box = boxes[0];
  if (!box) {
    return NextResponse.json({ error: "mailbox not found" }, { status: 404 });
  }

  try {
    const message = await readMessage(box, uid);
    return NextResponse.json(
      { message },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "read failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
