import { prisma } from "@/lib/prisma";
import type { InboxItem, InboxMessage } from "@/lib/imapInbox";

export const AYCD_BOX_ID = "aycd";

export type AycdBox = {
  id: typeof AYCD_BOX_ID;
  name: string;
  email: string;
};

const bodies = new Map<number, InboxMessage>();

function bases() {
  return [
    process.env.AYCD_INBOX_URL,
    "https://inbox.aycd.io",
    "https://api.aycd.io/inbox",
    "http://127.0.0.1:3232",
  ].filter((u): u is string => Boolean(u));
}

export async function loadAycdKey(): Promise<string | null> {
  const keys = await prisma.apiKey.findMany({
    where: { group: "aycd" },
    select: { apiKey: true, slug: true },
  });
  const inbox = keys.find((k) => k.apiKey.trim().toLowerCase().startsWith("inbox-"));
  const any = keys.find((k) => k.apiKey.trim() && k.slug !== "aycd" && k.slug !== "aycd-autosolve");
  return (inbox ?? any)?.apiKey.trim() || null;
}

export async function aycdBox(): Promise<AycdBox | null> {
  const key = await loadAycdKey();
  if (!key) return null;
  return { id: AYCD_BOX_ID, name: "Outlook", email: "aycd" };
}

type RawMail = Record<string, unknown>;

function asString(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asDate(v: unknown) {
  if (!v) return null;
  const d = new Date(asString(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickList(data: unknown): RawMail[] {
  if (Array.isArray(data)) return data as RawMail[];
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  for (const key of ["emails", "messages", "items", "mails", "data", "results"]) {
    const v = o[key];
    if (Array.isArray(v)) return v as RawMail[];
    if (v && typeof v === "object" && Array.isArray((v as { items?: unknown }).items)) {
      return (v as { items: RawMail[] }).items;
    }
  }
  return [];
}

function toItem(raw: RawMail, index: number): InboxItem {
  const id = asString(raw.id ?? raw.messageId ?? raw.uid ?? index);
  const uid = Number.parseInt(id.replace(/\D/g, "").slice(-9), 10) || index + 1;
  const from = asString(raw.from ?? raw.sender ?? raw.fromAddress ?? "Unknown");
  const to = asString(raw.to ?? raw.recipient ?? raw.toAddress ?? raw.email ?? "");
  const subject = asString(raw.subject ?? raw.title ?? "(no subject)");
  const date = asDate(raw.date ?? raw.receivedAt ?? raw.createdAt ?? raw.time);
  const text = asString(raw.text ?? raw.body ?? raw.preview ?? raw.snippet ?? "");
  const html = raw.html != null ? asString(raw.html) : null;
  const unseen = raw.unseen === true || raw.seen === false || raw.read === false;
  const item: InboxItem = {
    id: `${AYCD_BOX_ID}:${uid}`,
    uid,
    mailboxId: AYCD_BOX_ID,
    mailboxName: "Outlook",
    mailboxEmail: "aycd",
    to: to || asString(raw.account ?? raw.mailbox ?? ""),
    from,
    subject,
    date,
    unseen,
  };
  bodies.set(uid, { ...item, text, html });
  return item;
}

async function tryFetch(url: string, key: string, init?: RequestInit) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "X-API-Key": key,
    ...(init?.headers ?? {}),
  };
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function listAycdInbox(limit = 80): Promise<{ items: InboxItem[]; error?: string }> {
  const key = await loadAycdKey();
  if (!key) return { items: [], error: "Add an Inbox AYCD key in Keys → AYCD." };

  const paths = [
    `/api/v1/messages?limit=${limit}`,
    `/api/v1/emails?limit=${limit}`,
    `/v1/messages?limit=${limit}`,
    `/v1/emails?limit=${limit}`,
    `/api/v1/mail/messages?limit=${limit}`,
  ];

  const errors: string[] = [];
  for (const base of bases()) {
    for (const path of paths) {
      const url = `${base.replace(/\/$/, "")}${path}`;
      try {
        const data = await tryFetch(url, key);
        if (!data) continue;
        const rows = pickList(data);
        if (!rows.length && typeof data === "object" && data && "error" in data) {
          errors.push(asString((data as { error: unknown }).error));
          continue;
        }
        if (!rows.length) continue;
        return { items: rows.slice(0, limit).map((row, i) => toItem(row, i)) };
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "fetch failed");
      }
    }
  }

  return {
    items: [],
    error:
      errors[0] ||
      "AYCD Inbox unreachable. Use an Inbox- key and keep AYCD Inbox running with Tasks enabled.",
  };
}

export function readAycdMessage(uid: number): InboxMessage | null {
  return bodies.get(uid) ?? null;
}

export async function testAycdConnection() {
  const key = await loadAycdKey();
  if (!key) {
    return { ok: false, count: 0, error: "No AYCD key saved. Add one in Keys → AYCD." };
  }
  const data = await listAycdInbox(20);
  if (data.error && !data.items.length) {
    return { ok: false, count: 0, error: data.error };
  }
  const sample = data.items[0];
  return {
    ok: true,
    count: data.items.length,
    from: sample?.from ?? null,
    subject: sample?.subject ?? null,
    error: data.error ?? null,
  };
}
