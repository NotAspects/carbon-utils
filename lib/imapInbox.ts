import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { INBOX_PAGE_SIZE } from "@/lib/inboxLimits";

export type InboxMailbox = {
  id: string;
  slug?: string;
  name: string;
  email: string;
  host: string;
  port: number;
  password: string;
  kind?: string;
};

export type InboxItem = {
  id: string;
  uid: number;
  mailboxId: string;
  mailboxName: string;
  mailboxEmail: string;
  to: string;
  from: string;
  subject: string;
  date: string | null;
  unseen: boolean;
};

export type InboxMessage = InboxItem & {
  text: string;
  html: string | null;
};

const LIST_TTL_MS = 45_000;
const BODY_TTL_MS = 180_000;
const IDLE_MS = 4 * 60_000;

const listCache = new Map<string, ListHit>();
const bodyCache = new Map<string, { at: number; message: InboxMessage }>();
const CACHE_MAX = 240;

function capCache<K, V>(map: Map<K, V>, max = CACHE_MAX) {
  while (map.size > max) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}

type ListHit = {
  at: number;
  items: InboxItem[];
  error?: string;
  exists?: number;
  uidNext?: number;
  hasMore?: boolean;
};

type Addr = { name?: string | null; address?: string | null };

function formatAddrs(list?: Addr[] | null) {
  if (!list?.length) return "";
  return list
    .map((a) => {
      if (a.name && a.address) return `${a.name} <${a.address}>`;
      return a.address || a.name || "";
    })
    .filter(Boolean)
    .join(", ");
}

function emailsOf(list?: Addr[] | null) {
  return (list ?? []).map((a) => a.address?.trim()).filter((e): e is string => Boolean(e));
}

export function associatedTo(boxEmail: string, ...lists: (Addr[] | null | undefined)[]) {
  const box = boxEmail.toLowerCase();
  const seen = new Set<string>();
  const all: string[] = [];
  for (const list of lists) {
    for (const email of emailsOf(list)) {
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(email);
    }
  }
  return all.find((e) => e.toLowerCase() !== box) || all[0] || boxEmail;
}

function poolKey(box: InboxMailbox) {
  return `${box.host}:${box.port}:${box.email.toLowerCase()}`;
}

function boxScore(box: InboxMailbox) {
  if (box.kind === "catchall") return 0;
  if (box.slug === "otp" || box.name.toLowerCase() === "otp") return 3;
  return 1;
}

export function uniqueBoxes(boxes: InboxMailbox[]) {
  const best = new Map<string, InboxMailbox>();
  for (const box of boxes) {
    const key = poolKey(box);
    const prev = best.get(key);
    if (!prev || boxScore(box) > boxScore(prev)) best.set(key, box);
  }
  return [...best.values()];
}

function toIso(value?: Date | string | null) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function connect(box: InboxMailbox) {
  return new ImapFlow({
    host: box.host,
    port: box.port,
    secure: true,
    auth: { user: box.email, pass: box.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 5 * 60_000,
  });
}

type PoolEntry = {
  client: ImapFlow;
  tail: Promise<void>;
  idle?: ReturnType<typeof setTimeout>;
};

const pool = new Map<string, PoolEntry>();

async function drop(key: string) {
  const entry = pool.get(key);
  if (!entry) return;
  pool.delete(key);
  if (entry.idle) clearTimeout(entry.idle);
  try {
    await entry.client.logout();
  } catch {
    try {
      entry.client.close();
    } catch {
      /* ignore */
    }
  }
}

function touchIdle(key: string) {
  const entry = pool.get(key);
  if (!entry) return;
  if (entry.idle) clearTimeout(entry.idle);
  entry.idle = setTimeout(() => {
    void drop(key);
  }, IDLE_MS);
}

async function withClient<T>(box: InboxMailbox, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const key = poolKey(box);
  const existing = pool.get(key);
  const prev = existing?.tail ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  const chained = prev.then(
    () => next,
    () => next
  );
  if (existing) existing.tail = chained;
  await prev.catch(() => undefined);

  let entry = pool.get(key);
  try {
    if (!entry?.client.usable) {
      if (entry) await drop(key);
      const client = connect(box);
      await client.connect();
      entry = { client, tail: chained };
      pool.set(key, entry);
    } else {
      entry.tail = chained;
    }
    if (entry.idle) clearTimeout(entry.idle);
    return await fn(entry.client);
  } catch (e) {
    await drop(key);
    throw e;
  } finally {
    touchIdle(key);
    release();
  }
}

function toItem(
  box: InboxMailbox,
  msg: {
    uid?: number;
    envelope?: {
      subject?: string | null;
      from?: Addr[] | null;
      to?: Addr[] | null;
      cc?: Addr[] | null;
      date?: Date | string | null;
    };
    flags?: Set<string>;
    internalDate?: Date | string | null;
  }
): InboxItem | null {
  if (msg.uid == null) return null;
  return {
    id: `${box.id}:${msg.uid}`,
    uid: msg.uid,
    mailboxId: box.id,
    mailboxName: box.name,
    mailboxEmail: box.email,
    to: associatedTo(box.email, msg.envelope?.to, msg.envelope?.cc),
    from: formatAddrs(msg.envelope?.from) || "Unknown",
    subject: msg.envelope?.subject?.trim() || "(no subject)",
    date: toIso(msg.internalDate ?? msg.envelope?.date ?? null),
    unseen: !msg.flags?.has("\\Seen"),
  };
}

async function listOne(box: InboxMailbox, limit: number, offset = 0): Promise<ListHit> {
  try {
    return await withClient(box, async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const mb = client.mailbox;
        if (!mb) return { at: Date.now(), items: [], hasMore: false };
        const exists = mb.exists ?? 0;
        const uidNext = mb.uidNext;
        if (!exists || offset >= exists) {
          return { at: Date.now(), items: [], exists, uidNext, hasMore: false };
        }
        const end = exists - offset;
        const from = Math.max(1, end - limit + 1);
        const items: InboxItem[] = [];
        for await (const msg of client.fetch(`${from}:${end}`, {
          envelope: true,
          flags: true,
          uid: true,
          internalDate: true,
        })) {
          const item = toItem(box, msg);
          if (item) items.push(item);
        }
        items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        return { at: Date.now(), items, exists, uidNext, hasMore: from > 1 };
      } finally {
        lock.release();
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "IMAP error";
    return { at: Date.now(), items: [], error: `${box.email}: ${message}`, hasMore: false };
  }
}

function listKey(box: InboxMailbox, limit: number, offset: number) {
  return `${poolKey(box)}:${limit}:${offset}`;
}

export async function listMailbox(box: InboxMailbox, limit = INBOX_PAGE_SIZE, force = false, offset = 0) {
  const cacheKey = listKey(box, limit, offset);
  const hit = listCache.get(cacheKey);
  if (!force && hit && Date.now() - hit.at < LIST_TTL_MS) return hit;

  if (!force && offset === 0 && hit && hit.uidNext != null && hit.exists != null && !hit.error) {
    try {
      const st = await withClient(box, (client) => client.status("INBOX", { uidNext: true, messages: true }));
      if (st.uidNext === hit.uidNext && st.messages === hit.exists) {
        const fresh = { ...hit, at: Date.now() };
        listCache.set(cacheKey, fresh);
        capCache(listCache);
        return fresh;
      }
    } catch {
      /* fall through to a full fetch */
    }
  }

  const result = await listOne(box, limit, offset);
  listCache.set(cacheKey, result);
  capCache(listCache);
  return result;
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function listInbox(boxes: InboxMailbox[], limit = INBOX_PAGE_SIZE, force = false) {
  const unique = uniqueBoxes(boxes.filter((b) => b.password.trim()));
  const results = await mapPool(unique, 3, (box) => listMailbox(box, limit, force));
  const items = results.flatMap((r) => r.items);
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const errors = results.map((r) => r.error).filter((e): e is string => Boolean(e));
  return { items, errors, mailboxes: unique.map((b) => ({ id: b.id, name: b.name, email: b.email })) };
}

export function warmInbox(boxes: InboxMailbox[]) {
  for (const box of uniqueBoxes(boxes.filter((b) => b.password.trim()))) {
    void withClient(box, async (client) => {
      if (!client.mailbox) await client.mailboxOpen("INBOX");
    }).catch(() => undefined);
  }
}

export async function readMessage(box: InboxMailbox, uid: number): Promise<InboxMessage> {
  const cacheKey = `${poolKey(box)}:${uid}`;
  const hit = bodyCache.get(cacheKey);
  if (hit && Date.now() - hit.at < BODY_TTL_MS) return hit.message;

  const message = await withClient(box, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const msg = await client.fetchOne(
        String(uid),
        {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          source: { maxLength: 180_000 },
        },
        { uid: true }
      );
      if (!msg || msg.uid == null) throw new Error("message not found");

      let text = "";
      let html: string | null = null;
      let parsedTo: Addr[] = [];
      let headerTo: Addr[] = [];
      try {
        const parsed = await simpleParser(msg.source ?? Buffer.from(""));
        text = (parsed.text || "").trim();
        html = typeof parsed.html === "string" && parsed.html.trim() ? parsed.html : null;
        const toField = parsed.to;
        parsedTo = (Array.isArray(toField) ? toField : toField ? [toField] : []).flatMap((part) => part.value ?? []);
        const extra = ["x-original-to", "delivered-to", "x-forwarded-to"]
          .flatMap((key) => {
            const raw = parsed.headers?.get(key);
            if (!raw) return [];
            const textVal = Array.isArray(raw) ? raw.join(",") : String(raw);
            return textVal.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
          })
          .map((address) => ({ address }));
        headerTo = extra;
      } catch {
        text = (msg.source?.toString("utf8") || "").trim();
      }

      return {
        id: `${box.id}:${msg.uid}`,
        uid: msg.uid,
        mailboxId: box.id,
        mailboxName: box.name,
        mailboxEmail: box.email,
        to: associatedTo(box.email, msg.envelope?.to, parsedTo, headerTo, msg.envelope?.cc),
        from: formatAddrs(msg.envelope?.from) || "Unknown",
        subject: msg.envelope?.subject?.trim() || "(no subject)",
        date: toIso(msg.internalDate ?? msg.envelope?.date ?? null),
        unseen: !msg.flags?.has("\\Seen"),
        text: text || (html ? "" : "(empty message)"),
        html,
      };
    } finally {
      lock.release();
    }
  });

  bodyCache.set(cacheKey, { at: Date.now(), message });
  capCache(bodyCache);
  return message;
}
