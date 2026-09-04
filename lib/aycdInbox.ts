import { prisma } from "@/lib/prisma";
import { listMailbox, readMessage, type InboxItem, type InboxMailbox, type InboxMessage } from "@/lib/imapInbox";

export const AYCD_BOX_ID = "aycd";
export const AYCD_IMAP_HOST_DEFAULT = "4vkd6wans5dkg5vn-inbox-imap.aycd.net";

export type AycdBox = {
  id: typeof AYCD_BOX_ID;
  name: string;
  email: string;
};

const bodies = new Map<number, InboxMessage>();

export function aycdImapHost() {
  return process.env.AYCD_IMAP_HOST?.trim() || AYCD_IMAP_HOST_DEFAULT;
}

export async function aycdImapBox(): Promise<InboxMailbox | null> {
  const host = aycdImapHost();
  if (!host) return null;
  const user = process.env.AYCD_IMAP_USER?.trim() || "";
  const pass = process.env.AYCD_IMAP_PASSWORD?.trim() || "";
  if (!user || !pass) return null;
  return {
    id: AYCD_BOX_ID,
    slug: "aycd",
    name: "Outlook",
    email: "aycd",
    user,
    host,
    port: Number(process.env.AYCD_IMAP_PORT) || 993,
    password: pass,
    kind: "outlook",
  };
}

function bases() {
  const extra = process.env.AYCD_INBOX_URL?.trim();
  return [
    extra,
    "https://inbox.aycd.io",
    "https://inbox-api.aycd.io",
    "https://api.aycd.io/inbox",
    "https://api.aycd.io",
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
  if (aycdImapHost() || (await loadAycdKey())) {
    return { id: AYCD_BOX_ID, name: "Outlook", email: "aycd" };
  }
  return null;
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
  for (const key of ["emails", "messages", "items", "mails", "data", "results", "tasks"]) {
    const v = o[key];
    if (Array.isArray(v)) return v as RawMail[];
    if (v && typeof v === "object" && Array.isArray((v as { items?: unknown }).items)) {
      return (v as { items: RawMail[] }).items;
    }
  }
  if (o.email || o.subject || o.from || o.body || o.text) return [o];
  return [];
}

function toItem(raw: RawMail, index: number): InboxItem {
  const id = asString(raw.id ?? raw.messageId ?? raw.uid ?? raw.taskId ?? index);
  const uid = Number.parseInt(id.replace(/\D/g, "").slice(-9), 10) || index + 1;
  const from = asString(raw.from ?? raw.sender ?? raw.fromAddress ?? "Unknown");
  const to = asString(raw.to ?? raw.recipient ?? raw.toAddress ?? raw.email ?? "");
  const subject = asString(raw.subject ?? raw.title ?? "(no subject)");
  const date = asDate(raw.date ?? raw.receivedAt ?? raw.createdAt ?? raw.time);
  const text = asString(raw.text ?? raw.body ?? raw.preview ?? raw.snippet ?? raw.code ?? "");
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

type Hit = { ok: boolean; status: number; data: unknown; error?: string };

async function hit(url: string, key: string, init?: RequestInit): Promise<Hit> {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: key,
    "X-API-Key": key,
    ...(init?.headers ?? {}),
  };
  try {
    const res = await fetch(url, { ...init, headers, cache: "no-store" });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const err =
        data && typeof data === "object" && "error" in data
          ? asString((data as { error: unknown }).error)
          : `HTTP ${res.status}`;
      return { ok: false, status: res.status, data, error: err };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

function itemsFrom(data: unknown, limit: number) {
  const rows = pickList(data);
  if (!rows.length) return [];
  return rows.slice(0, limit).map((row, i) => toItem(row, i));
}

const GET_PATHS = (key: string, limit: number) => {
  const q = `apiKey=${encodeURIComponent(key)}&limit=${limit}`;
  return [
    `/api/v1/messages?${q}`,
    `/api/v1/emails?${q}`,
    `/api/v1/mail?${q}`,
    `/api/v1/tasks?${q}`,
    `/v1/messages?${q}`,
    `/v1/emails?${q}`,
    `/status?${q}`,
    `/api/v1/status?${q}`,
  ];
};

const POST_PATHS = [
  "/api/v1/tasks",
  "/api/v1/tasks/create",
  "/v1/tasks",
  "/api/v1/mail/tasks",
  "/api/v1/mail/search",
];

export async function listAycdInbox(
  limit = 80,
  offset = 0,
  force = false
): Promise<{ items: InboxItem[]; error?: string; hasMore?: boolean }> {
  if (aycdImapHost()) {
    const box = await aycdImapBox();
    if (!box) {
      return {
        items: [],
        error:
          "AYCD IMAP login missing. On Vercel, set AYCD_IMAP_HOST, AYCD_IMAP_PORT, AYCD_IMAP_USER, AYCD_IMAP_PASSWORD (Inbox → Mail → IMAP Service: inbox@aycd.me + the IMAP password). Then redeploy.",
      };
    }
    const data = await listMailbox(box, limit, force, offset);
    return { items: data.items, error: data.error, hasMore: data.hasMore };
  }

  const key = await loadAycdKey();
  if (!key) return { items: [], error: "Add an Inbox AYCD key in Keys → AYCD." };

  const errors: string[] = [];
  for (const base of bases()) {
    const root = base.replace(/\/$/, "");
    for (const path of GET_PATHS(key, limit)) {
      const result = await hit(`${root}${path}`, key);
      if (result.ok) {
        const items = itemsFrom(result.data, limit);
        if (items.length) return { items };
        if (result.data && typeof result.data === "object" && "ok" in (result.data as object)) {
          return { items: [], error: undefined };
        }
      } else if (result.error && result.error !== "fetch failed") {
        errors.push(result.error);
      }
    }

    for (const path of POST_PATHS) {
      const result = await hit(`${root}${path}`, key, {
        method: "POST",
        body: JSON.stringify({ apiKey: key, timeout: 8, lookback: true }),
      });
      if (result.ok) {
        const items = itemsFrom(result.data, limit);
        if (items.length) return { items };
      } else if (result.error && result.error !== "fetch failed") {
        errors.push(result.error);
      }
    }
  }

  return {
    items: [],
    error: errors[0] || "AYCD Inbox API unreachable. IMAP UpLink is preferred — set AYCD_IMAP_HOST.",
  };
}

export async function readAycdMessage(uid: number): Promise<InboxMessage | null> {
  const box = await aycdImapBox();
  if (box) return readMessage(box, uid);
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
