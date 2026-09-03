import { INBOX_PAGE_SIZE, mapPool } from "@/lib/inboxLimits";

type Entry = { at: number; data: unknown };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();
const VAULT_TTL_MS = Number.POSITIVE_INFINITY;
const INBOX_TTL_MS = 40_000;

let warming: Promise<void> | null = null;

function ttlFor(key: string) {
  if (key.startsWith("inbox-box:") || key === "inbox") return INBOX_TTL_MS;
  return VAULT_TTL_MS;
}

export function peekCache<T>(key: string): T | undefined {
  const hit = cache.get(key);
  return hit ? (hit.data as T) : undefined;
}

export function hasCache(key: string) {
  return cache.has(key);
}

export function isFresh(key: string, ms?: number) {
  const hit = cache.get(key);
  if (!hit) return false;
  return Date.now() - hit.at < (ms ?? ttlFor(key));
}

export function setCache<T>(key: string, data: T) {
  cache.set(key, { at: Date.now(), data });
}

export function dropCache(key: string) {
  cache.delete(key);
}

export function dropCachePrefix(prefix: string) {
  for (const key of [...cache.keys()]) {
    if (key === prefix || key.startsWith(prefix)) cache.delete(key);
  }
}

export async function fetchJson<T>(key: string, url: string, force = false): Promise<T | null> {
  if (!force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlFor(key)) return hit.data as T;
    const pending = inFlight.get(key);
    if (pending) return (await pending) as T | null;
  }

  const run = (async () => {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return (cache.get(key)?.data as T) ?? null;
    const data = (await res.json()) as T;
    setCache(key, data);
    return data;
  })();

  inFlight.set(key, run);
  try {
    return (await run) as T | null;
  } finally {
    inFlight.delete(key);
  }
}

async function warmAll() {
  const [sites, mailboxes, , , boxesWrap] = await Promise.all([
    fetchJson<{ sites: { id: string; slug?: string }[] }>("sites", "/api/sites"),
    fetchJson<{ mailboxes: { id: string; slug?: string; kind?: string }[] }>("mailboxes", "/api/mailboxes"),
    fetchJson("keys", "/api/keys"),
    fetchJson("proxies", "/api/proxies"),
    fetchJson<{ mailboxes?: { id: string }[] }>("inbox-boxes", "/api/inbox/boxes"),
  ]);

  await Promise.all([
    mapPool(
      (sites?.sites ?? []).filter((site) => site.slug !== "outlook"),
      4,
      (site) => fetchJson(`accounts:${site.id}`, `/api/accounts?siteId=${encodeURIComponent(site.id)}`)
    ),
    mapPool(
      (mailboxes?.mailboxes ?? []).filter((box) => box.slug !== "outlook" && box.kind !== "outlook"),
      4,
      (box) => fetchJson(`mail-accounts:${box.id}`, `/api/mail-accounts?mailboxId=${encodeURIComponent(box.id)}`)
    ),
    fetchJson("balances", "/api/keys/balances"),
  ]);

  const imap = boxesWrap?.mailboxes ?? [];
  await mapPool(imap, 2, (box) =>
    fetchJson<unknown>(
      `inbox-box:${box.id}`,
      `/api/inbox?mailboxId=${encodeURIComponent(box.id)}&limit=${INBOX_PAGE_SIZE}`
    )
  );
}

export function prefetchVault() {
  if (!warming) warming = warmAll().catch(() => undefined);
  return warming;
}

export function prefetchPath(href: string) {
  void prefetchVault();
  if (href === "/accounts") void fetchJson("sites", "/api/sites");
  if (href === "/mails") void fetchJson("mailboxes", "/api/mailboxes");
  if (href === "/keys") void fetchJson("keys", "/api/keys");
  if (href === "/isp") void fetchJson("proxies", "/api/proxies");
  if (href === "/inbox") void fetchJson("inbox-boxes", "/api/inbox/boxes");
}
