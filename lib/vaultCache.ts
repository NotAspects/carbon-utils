type Entry = { at: number; data: unknown };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();
const FRESH_MS = 20_000;

export function peekCache<T>(key: string): T | undefined {
  const hit = cache.get(key);
  return hit ? (hit.data as T) : undefined;
}

export function isFresh(key: string, ms = FRESH_MS) {
  const hit = cache.get(key);
  return Boolean(hit && Date.now() - hit.at < ms);
}

export function setCache<T>(key: string, data: T) {
  cache.set(key, { at: Date.now(), data });
}

export function dropCache(key: string) {
  cache.delete(key);
}

export async function fetchJson<T>(key: string, url: string, force = false): Promise<T | null> {
  if (!force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) return hit.data as T;
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

export function prefetchVault() {
  void fetchJson("sites", "/api/sites");
  void fetchJson("mailboxes", "/api/mailboxes");
  void fetchJson("keys", "/api/keys");
  void fetchJson("proxies", "/api/proxies");
}

export function prefetchPath(href: string) {
  if (href === "/accounts") void fetchJson("sites", "/api/sites");
  if (href === "/mails") void fetchJson("mailboxes", "/api/mailboxes");
  if (href === "/keys") void fetchJson("keys", "/api/keys");
  if (href === "/isp") void fetchJson("proxies", "/api/proxies");
  if (href === "/inbox") void fetchJson("inbox-boxes", "/api/inbox/boxes");
}
