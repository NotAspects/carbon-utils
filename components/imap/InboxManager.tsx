"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, Mail, RefreshCw, Search, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { INBOX_PAGE_MAX, INBOX_PAGE_SIZE, INBOX_POLL_MS, mapPool } from "@/lib/inboxLimits";
import { mailLogoFor } from "@/lib/mailboxes";
import { fetchJson, peekCache, setCache } from "@/lib/vaultCache";

type InboxRow = {
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

type InboxBody = InboxRow & {
  text: string;
  html: string | null;
};

type MailboxChip = { id: string; name: string; email: string };

type Thread = {
  key: string;
  latest: InboxRow;
  messages: InboxRow[];
  unseen: number;
};

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fromName(from: string) {
  const name = from.replace(/<[^>]+>/, "").trim();
  return name || from;
}

function fromEmail(from: string) {
  return (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
}

function normSubject(subject: string) {
  return subject
    .replace(/^(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function threadKey(row: InboxRow) {
  return `${fromEmail(row.from)}|${normSubject(row.subject)}`;
}

function rowMatches(row: InboxRow, query: string) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = [
    row.from,
    fromName(row.from),
    fromEmail(row.from),
    row.to,
    row.subject,
    row.mailboxName,
    row.mailboxEmail,
  ]
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => hay.includes(token));
}

function buildThreads(items: InboxRow[]): Thread[] {
  const map = new Map<string, InboxRow[]>();
  for (const row of items) {
    const key = threadKey(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()]
    .map(([key, messages]) => {
      messages.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return {
        key,
        latest: messages[0],
        messages,
        unseen: messages.filter((m) => m.unseen).length,
      };
    })
    .sort((a, b) => (b.latest.date || "").localeCompare(a.latest.date || ""));
}

type CachedInbox = { items: InboxRow[]; mailboxes: MailboxChip[] };
type BoxPayload = { items?: InboxRow[]; error?: string | null; hasMore?: boolean };

function sortRows(rows: InboxRow[]) {
  return rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

type BoxGroup = { id: string; label: string; boxes: MailboxChip[] };

function boxKind(box: MailboxChip) {
  const name = box.name.toLowerCase();
  const email = box.email.toLowerCase();
  if (box.id === "aycd" || email === "aycd" || name === "outlook") return "outlook";
  if (name === "otp" || email.startsWith("otp@")) return "otp";
  if (name.startsWith("@")) return "catchalls";
  return "gmail";
}

function groupMailboxes(boxes: MailboxChip[]): BoxGroup[] {
  const buckets: Record<string, MailboxChip[]> = { outlook: [], otp: [], gmail: [], catchalls: [] };
  for (const box of boxes) buckets[boxKind(box)].push(box);
  return [
    { id: "outlook", label: "Outlook", boxes: buckets.outlook },
    { id: "gmail", label: "Gmail", boxes: buckets.gmail },
    { id: "otp", label: "OTP", boxes: buckets.otp },
    { id: "catchalls", label: "Catchalls", boxes: buckets.catchalls },
  ].filter((g) => g.boxes.length);
}

function boxesForFilter(boxes: MailboxChip[], filter: string) {
  if (filter === "all") return boxes;
  if (filter.startsWith("g:")) {
    const id = filter.slice(2);
    return groupMailboxes(boxes).find((g) => g.id === id)?.boxes ?? [];
  }
  return boxes.filter((b) => b.email.toLowerCase() === filter);
}

function groupLogo(id: string) {
  if (id === "outlook") return mailLogoFor("outlook", "outlook");
  if (id === "gmail" || id === "otp") return mailLogoFor("forward", "forwardcarbon");
  return null;
}

function collectInbox(): CachedInbox {
  const boxWrap = peekCache<{ mailboxes?: MailboxChip[] }>("inbox-boxes");
  const legacy = peekCache<CachedInbox>("inbox");
  const mailboxes = boxWrap?.mailboxes ?? legacy?.mailboxes ?? [];
  const items: InboxRow[] = [];
  for (const box of mailboxes) {
    const part = peekCache<BoxPayload>(`inbox-box:${box.id}`);
    if (part?.items?.length) items.push(...part.items);
  }
  if (!items.length && legacy?.items?.length) items.push(...legacy.items);
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return { items, mailboxes };
}

export default function InboxManager() {
  const cached = collectInbox();
  const [items, setItems] = useState<InboxRow[]>(cached.items);
  const [mailboxes, setMailboxes] = useState<MailboxChip[]>(cached.mailboxes);
  const [errors, setErrors] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cached.items.length);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [queryLive, setQueryLive] = useState("");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [body, setBody] = useState<InboxBody | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [hasMoreByBox, setHasMoreByBox] = useState<Record<string, boolean>>({});
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (force = false) => {
    const seed = collectInbox();
    if (seed.items.length || seed.mailboxes.length) {
      setItems(seed.items);
      setMailboxes(seed.mailboxes);
      setLoading(false);
      if (force) setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const soloBox = new URLSearchParams(window.location.search).get("box");
      if (soloBox) {
        const data = await fetchJson<BoxPayload & { mailbox?: MailboxChip }>(
          `inbox-box:${soloBox}`,
          `/api/inbox?mailboxId=${encodeURIComponent(soloBox)}&limit=${INBOX_PAGE_SIZE}${force ? "&force=1" : ""}`,
          force
        );
        const chip = data?.mailbox ?? { id: soloBox, name: "Outlook", email: "" };
        const rows = data?.items ?? [];
        setMailboxes([chip]);
        setItems(rows);
        setHasMoreByBox({ [chip.id]: Boolean(data?.hasMore) });
        setErrors(data?.error ? [data.error] : []);
        setWarning(data?.error || null);
        setCache("inbox", { items: rows, mailboxes: [chip] });
        return;
      }

      const boxesP = fetchJson<{ mailboxes?: MailboxChip[] }>("inbox-boxes", "/api/inbox/boxes", force);
      let boxes = seed.mailboxes;
      if (!boxes.length) {
        boxes = (await boxesP)?.mailboxes ?? [];
        setMailboxes(boxes);
      } else {
        void boxesP.then((data) => {
          if (data?.mailboxes?.length) setMailboxes(data.mailboxes);
        });
      }

      if (boxes.length === 0) {
        setItems([]);
        setWarning("No IMAP passwords saved. Add them in Mails, or add an Inbox AYCD key in Keys.");
        setErrors([]);
        setCache("inbox", { items: [], mailboxes: [] });
        return;
      }

      setWarning(null);
      setErrors([]);

      const pull = async (box: MailboxChip) => {
        const data = await fetchJson<BoxPayload>(
          `inbox-box:${box.id}`,
          `/api/inbox?mailboxId=${encodeURIComponent(box.id)}&limit=${INBOX_PAGE_SIZE}${force ? "&force=1" : ""}`,
          force
        );
        return { box, data };
      };

      const applyPulls = (hits: { box: MailboxChip; data: BoxPayload | null }[], prev: InboxRow[]) => {
        const errs: string[] = [];
        const more: Record<string, boolean> = {};
        const touched = new Set(hits.map((h) => h.box.id));
        const map = force
          ? new Map(prev.filter((row) => !touched.has(row.mailboxId)).map((row) => [row.id, row]))
          : new Map(prev.map((row) => [row.id, row]));
        for (const { box, data } of hits) {
          if (data?.error) errs.push(data.error);
          more[box.id] = Boolean(data?.hasMore);
          for (const row of data?.items ?? []) map.set(row.id, row);
        }
        const next = sortRows([...map.values()]);
        setCache("inbox", { items: next, mailboxes: boxes });
        setHasMoreByBox((prevMore) => ({ ...prevMore, ...more }));
        if (errs.length) setErrors((prevErrs) => [...prevErrs, ...errs]);
        return next;
      };

      const first = await mapPool(boxes, 3, pull);
      setItems((prev) => applyPulls(first, prev));
      setLoading(false);
      if (new URLSearchParams(window.location.search).get("source") === "aycd") {
        const aycd = boxes.find((b) => b.id === "aycd" || b.email === "aycd");
        if (aycd) setFilter("g:outlook");
      }

      const latest = (await boxesP)?.mailboxes;
      if (latest?.length) {
        setMailboxes(latest);
        const known = new Set(boxes.map((b) => b.id));
        const extra = latest.filter((box) => !known.has(box.id));
        if (extra.length) {
          const extraHits = await mapPool(extra, 3, pull);
          setItems((prev) => applyPulls(extraHits, prev));
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const id = window.setInterval(tick, INBOX_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(queryLive), 180);
    return () => clearTimeout(t);
  }, [queryLive]);

  const shown = useMemo(() => {
    const allowed = new Set(boxesForFilter(mailboxes, filter).map((b) => b.email.toLowerCase()));
    const scoped = filter === "all" ? items : items.filter((m) => allowed.has(m.mailboxEmail.toLowerCase()));
    if (!query.trim()) return scoped;
    return scoped.filter((row) => rowMatches(row, query));
  }, [items, filter, query, mailboxes]);

  const threads = useMemo(() => buildThreads(shown), [shown]);
  const activeThread = threads.find((t) => t.key === openThread) ?? null;
  const selected = shown.find((m) => m.id === selectedId) ?? null;
  const filterBoxes = useMemo(() => boxesForFilter(mailboxes, filter), [mailboxes, filter]);
  const canLoadMore = useMemo(
    () => filterBoxes.some((box) => hasMoreByBox[box.id] === true),
    [filterBoxes, hasMoreByBox]
  );
  const loadBatch = filterBoxes.length === 1 ? INBOX_PAGE_MAX : INBOX_PAGE_SIZE;

  async function loadMore() {
    const targets = filterBoxes.filter((box) => hasMoreByBox[box.id] === true);
    if (!targets.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const counts = new Map<string, number>();
      for (const row of items) counts.set(row.mailboxId, (counts.get(row.mailboxId) ?? 0) + 1);
      const hits = await mapPool(targets, 2, async (box) => {
        const offset = counts.get(box.id) ?? 0;
        const res = await fetch(
          `/api/inbox?mailboxId=${encodeURIComponent(box.id)}&limit=${loadBatch}&offset=${offset}`
        );
        const data = (await res.json()) as BoxPayload;
        return { box, data };
      });
      const more: Record<string, boolean> = {};
      setItems((prev) => {
        const map = new Map(prev.map((row) => [row.id, row]));
        for (const { box, data } of hits) {
          more[box.id] = Boolean(data.hasMore);
          for (const row of data.items ?? []) map.set(row.id, row);
        }
        const next = sortRows([...map.values()]);
        setCache("inbox", { items: next, mailboxes });
        return next;
      });
      setHasMoreByBox((prev) => ({ ...prev, ...more }));
    } finally {
      setLoadingMore(false);
    }
  }

  async function openMail(row: InboxRow, threadKeyValue: string) {
    setOpenThread(threadKeyValue);
    setSelectedId(row.id);
    const bodyKey = `inbox-msg:${row.id}`;
    const cachedBody = peekCache<InboxBody>(bodyKey);
    if (cachedBody) {
      setBody(cachedBody);
      setLoadingBody(false);
      setItems((prev) => prev.map((m) => (m.id === row.id ? { ...m, unseen: false } : m)));
      return;
    } else {
      setLoadingBody(true);
      setBody(null);
    }
    try {
      const res = await fetch(
        `/api/inbox/message?mailboxId=${encodeURIComponent(row.mailboxId)}&uid=${row.uid}`
      );
      const data = (await res.json()) as { message?: InboxBody };
      if (data.message) {
        setCache(bodyKey, data.message);
        setBody(data.message);
        setItems((prev) => prev.map((m) => (m.id === row.id ? { ...m, unseen: false } : m)));
      }
    } finally {
      setLoadingBody(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-6xl flex-col px-4 py-6 lg:h-screen lg:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader page="inbox" />
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="carbon-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-[13px]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading || refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--carbon-text-muted)]" />
        <input
          value={queryLive}
          onChange={(e) => setQueryLive(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQueryLive("");
              setQuery("");
            }
          }}
          placeholder="Search sender, address, subject…"
          className="carbon-input py-2 pl-8 pr-8 text-[13px]"
        />
        {queryLive && (
          <button
            type="button"
            onClick={() => {
              setQueryLive("");
              setQuery("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <InboxSourceBar boxes={mailboxes} filter={filter} onChange={setFilter} />

      {warning && <p className="mb-3 text-[12px] text-[var(--carbon-text-muted)]">{warning}</p>}
      {errors.length > 0 && (
        <p className="mb-3 text-[12px] text-[var(--carbon-error)]">{errors.join(" · ")}</p>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(280px,400px)_1fr]">
        <div className="carbon-card flex min-h-0 flex-col overflow-hidden">
          {loading && threads.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--carbon-text-muted)]" />
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
              <Inbox className="h-6 w-6 text-[var(--carbon-text-muted)]" />
              <p className="text-sm text-[var(--carbon-text-muted)]">
                {query.trim() ? "No messages match this search." : "No messages yet."}
              </p>
              {canLoadMore && (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="carbon-btn-secondary mt-2 inline-flex items-center gap-1.5 px-3 py-2 text-[12px]"
                >
                  {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {loadBatch === INBOX_PAGE_MAX
                    ? `Load ${INBOX_PAGE_MAX} older messages`
                    : "Load older messages"}
                </button>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {threads.map((thread) => {
                const row = thread.latest;
                const count = thread.messages.length;
                const unread = thread.unseen > 0;
                return (
                  <div key={thread.key} className="border-b border-[var(--carbon-border)]">
                    <button
                      type="button"
                      onClick={() => openMail(row, thread.key)}
                      className={`w-full border-l-2 px-3.5 py-3 text-left transition-colors hover:bg-[var(--carbon-bg-hover)] ${
                        openThread === thread.key
                          ? "border-white bg-[var(--carbon-bg-hover)]"
                          : "border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`flex min-w-0 items-center gap-1.5 truncate text-[13px] ${
                            unread ? "font-semibold text-white" : "text-[var(--carbon-text)]"
                          }`}
                        >
                          <span className="truncate">{fromName(row.from)}</span>
                          {count > 1 && (
                            <span className="shrink-0 rounded-md bg-[var(--carbon-bg)] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--carbon-text-muted)]">
                              {count}
                            </span>
                          )}
                        </p>
                        <span className="shrink-0 text-[11px] tabular-nums text-[var(--carbon-text-muted)]">
                          {when(row.date)}
                        </span>
                      </div>
                      <p
                        className={`mt-0.5 truncate text-[12px] ${
                          unread ? "text-white" : "text-[var(--carbon-text-secondary)]"
                        }`}
                      >
                        {row.subject}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--carbon-text-muted)]">
                        {count > 1
                          ? `${count} messages · latest ${row.to || row.mailboxEmail}`
                          : row.to || row.mailboxEmail}
                      </p>
                    </button>
                    {openThread === thread.key && count > 1 && (
                      <div className="max-h-64 overflow-y-auto border-t border-[var(--carbon-border)] bg-[var(--carbon-bg)] px-2 py-1.5">
                        {thread.messages.map((msg) => (
                          <button
                            key={msg.id}
                            type="button"
                            onClick={() => openMail(msg, thread.key)}
                            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-[var(--carbon-bg-hover)] ${
                              selectedId === msg.id ? "text-white" : "text-[var(--carbon-text-muted)]"
                            }`}
                          >
                            <span className="min-w-0 truncate">{msg.to || msg.mailboxEmail}</span>
                            <span className="shrink-0 tabular-nums">{when(msg.date)}</span>
                            {msg.unseen && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {canLoadMore && (
                <div className="p-3">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="carbon-btn-secondary flex w-full items-center justify-center gap-1.5 py-2 text-[12px]"
                  >
                    {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {loadBatch === INBOX_PAGE_MAX
                    ? `Load ${INBOX_PAGE_MAX} older messages`
                    : "Load older messages"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="carbon-card flex min-h-[320px] flex-col overflow-hidden">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
              <Inbox className="h-6 w-6 text-[var(--carbon-text-muted)]" />
              <p className="text-sm text-[var(--carbon-text-muted)]">Select a message to read it.</p>
            </div>
          ) : loadingBody ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--carbon-text-muted)]" />
            </div>
          ) : body ? (
            <>
              <div className="border-b border-[var(--carbon-border)] px-4 py-3">
                <h2 className="text-[15px] font-medium text-white">{body.subject}</h2>
                <p className="mt-1 text-[12px] text-[var(--carbon-text-secondary)]">{body.from}</p>
                <p className="mt-0.5 text-[11px] text-[var(--carbon-text-muted)]">
                  {body.to || body.mailboxEmail}
                  {activeThread && activeThread.messages.length > 1
                    ? ` · ${activeThread.messages.length} in thread`
                    : ""}
                  {body.date ? ` · ${new Date(body.date).toLocaleString("en-GB")}` : ""}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {body.html ? (
                  <iframe
                    title={body.subject}
                    sandbox=""
                    srcDoc={body.html}
                    className="min-h-[420px] w-full rounded-md bg-white"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-[13px] leading-6 text-[var(--carbon-text)]">
                    {body.text}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <p className="p-4 text-sm text-[var(--carbon-text-muted)]">Could not load this message.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function InboxSourceBar({
  boxes,
  filter,
  onChange,
}: {
  boxes: MailboxChip[];
  filter: string;
  onChange: (value: string) => void;
}) {
  const groups = useMemo(() => groupMailboxes(boxes), [boxes]);
  const activeGroup =
    filter.startsWith("g:")
      ? groups.find((g) => g.id === filter.slice(2))
      : groups.find((g) => g.boxes.some((b) => b.email.toLowerCase() === filter));
  const children = activeGroup && activeGroup.boxes.length > 1 ? activeGroup.boxes : [];

  return (
    <div className="mb-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <SourceTab
          label="All"
          active={filter === "all"}
          onClick={() => onChange("all")}
        />
        {groups.map((group) => {
          const logo = groupLogo(group.id);
          const value = group.boxes.length === 1 ? group.boxes[0].email.toLowerCase() : `g:${group.id}`;
          const active =
            filter === value ||
            filter === `g:${group.id}` ||
            group.boxes.some((b) => b.email.toLowerCase() === filter);
          return (
            <SourceTab
              key={group.id}
              label={group.label}
              logo={logo}
              active={active}
              onClick={() => onChange(value)}
            />
          );
        })}
      </div>
      {activeGroup && children.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => onChange(`g:${activeGroup.id}`)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
              filter === `g:${activeGroup.id}`
                ? "bg-white text-[var(--carbon-bg)]"
                : "text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
            }`}
          >
            All {activeGroup.label}
          </button>
          {children.map((box) => (
            <button
              key={box.id}
              type="button"
              onClick={() => onChange(box.email.toLowerCase())}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
                filter === box.email.toLowerCase()
                  ? "bg-white text-[var(--carbon-bg)]"
                  : "text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
              }`}
            >
              {box.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceTab({
  label,
  logo,
  active,
  onClick,
}: {
  label: string;
  logo?: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors ${
        active
          ? "border-white/20 bg-[var(--carbon-bg-hover)] text-white"
          : "border-[var(--carbon-border)] bg-[var(--carbon-bg-elevated)] text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
      }`}
    >
      {logo ? (
        <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md bg-white p-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" className="h-full w-full object-contain" />
        </span>
      ) : label === "All" ? (
        <Inbox className="h-3.5 w-3.5" />
      ) : (
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--carbon-bg)]">
          <Mail className="h-3.5 w-3.5" />
        </span>
      )}
      {label}
    </button>
  );
}
