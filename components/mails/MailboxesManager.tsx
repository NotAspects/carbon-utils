"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Download, Eye, EyeOff, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { MAILBOX_CATALOG, groupOutlookAccounts, parseMailEntries } from "@/lib/mailboxes";
import { dropCachePrefix, fetchJson, peekCache } from "@/lib/vaultCache";
import MailGrid from "./MailGrid";

export type MailboxRow = {
  id: string;
  slug: string;
  name: string;
  email: string;
  host: string;
  port: number;
  password: string | null;
  kind: "forward" | "catchall" | string;
  domain: string | null;
  notes: string | null;
  total: number;
  active: number;
  used: number;
  banned: number;
  inactive: number;
};

type MailAccountRow = {
  id: string;
  login: string;
  password?: string | null;
  notes?: string | null;
};

type OutlookFilter = "all" | "account" | "alias";

function formatMailLine(a: { login: string; password?: string | null }) {
  return a.password ? `${a.login}:${a.password}` : a.login;
}

function domainOf(login: string) {
  const at = login.lastIndexOf("@");
  return at >= 0 ? login.slice(at + 1).toLowerCase() : "";
}

function visibleOutlook(rows: MailAccountRow[], filter: OutlookFilter, domain: string) {
  const groups = groupOutlookAccounts(rows);
  const list =
    filter === "account"
      ? groups.map((g) => g.account)
      : filter === "alias"
        ? groups.flatMap((g) => g.aliases)
        : groups.flatMap((g) => [g.account, ...g.aliases]);
  return domain === "all" ? list : list.filter((r) => domainOf(r.login) === domain);
}

function outlookText(rows: MailAccountRow[], filter: OutlookFilter, domain = "all") {
  return visibleOutlook(rows, filter, domain)
    .map((r) => r.login)
    .join("\n");
}

function mergeOutlookText(
  prev: MailAccountRow[],
  text: string,
  filter: OutlookFilter,
  domain = "all"
): MailAccountRow[] {
  const prevByLogin = new Map(prev.map((r) => [r.login.toLowerCase(), r]));
  const parsed = parseMailEntries(text).map((r) => ({
    id: r.login,
    login: r.login,
    password: r.password ?? prevByLogin.get(r.login.toLowerCase())?.password ?? null,
    notes:
      r.notes ??
      prevByLogin.get(r.login.toLowerCase())?.notes ??
      (filter === "alias" ? "alias" : filter === "account" ? "account" : null),
  }));
  const visible = new Set(visibleOutlook(prev, filter, domain).map((r) => r.login.toLowerCase()));
  const incoming = new Set(parsed.map((r) => r.login.toLowerCase()));
  const keep = prev.filter((r) => !visible.has(r.login.toLowerCase()) && !incoming.has(r.login.toLowerCase()));
  return [...keep, ...parsed];
}

export default function MailboxesManager() {
  const [mailboxes, setMailboxes] = useState<MailboxRow[]>(
    () => peekCache<{ mailboxes: MailboxRow[] }>("mailboxes")?.mailboxes ?? []
  );
  const [loadingBoxes, setLoadingBoxes] = useState(() => !peekCache("mailboxes"));
  const [loadingMails, setLoadingMails] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [imapPass, setImapPass] = useState("");
  const [savingImap, setSavingImap] = useState(false);
  const [mailText, setMailText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [savingMails, setSavingMails] = useState(false);
  const [outlookRows, setOutlookRows] = useState<MailAccountRow[]>([]);
  const [outlookFilter, setOutlookFilter] = useState<OutlookFilter>("all");
  const [outlookDomain, setOutlookDomain] = useState("all");

  const selected = mailboxes.find((m) => m.slug === selectedSlug) ?? null;
  const mailboxId = selected?.id ?? null;
  const isOutlook = selected?.kind === "outlook";
  const dirty = mailText !== savedText;
  const mailCount = mailText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;

  const outlookCounts = useMemo(() => {
    const groups = groupOutlookAccounts(outlookRows);
    const domains = new Map<string, number>();
    for (const row of outlookRows) {
      const d = domainOf(row.login);
      if (!d) continue;
      domains.set(d, (domains.get(d) ?? 0) + 1);
    }
    const preferred = ["hotmail.com", "outlook.com", "outlook.fr", "live.com", "msn.com"];
    const domainList = [...domains.entries()].sort((a, b) => {
      const ia = preferred.indexOf(a[0]);
      const ib = preferred.indexOf(b[0]);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return b[1] - a[1] || a[0].localeCompare(b[0]);
    });
    return {
      all: outlookRows.length,
      account: groups.length,
      alias: groups.reduce((sum, g) => sum + g.aliases.length, 0),
      domains: domainList,
    };
  }, [outlookRows]);

  const loadMailboxes = useCallback(async (force = false) => {
    const cached = peekCache<{ mailboxes: MailboxRow[] }>("mailboxes");
    const have = new Set(cached?.mailboxes?.map((m) => m.slug) ?? []);
    const catalogReady = MAILBOX_CATALOG.every((c) => have.has(c.slug));
    if (cached?.mailboxes && !force && catalogReady) {
      setMailboxes(cached.mailboxes);
      setLoadingBoxes(false);
      return;
    }
    const data = await fetchJson<{ mailboxes: MailboxRow[] }>("mailboxes", "/api/mailboxes", force);
    if (data?.mailboxes) setMailboxes(data.mailboxes);
    setLoadingBoxes(false);
  }, []);

  const loadMails = useCallback(async (id: string, force = false, outlook = false) => {
    const key = `mail-accounts:${id}`;
    const cached = peekCache<{ accounts: MailAccountRow[] }>(key);
    if (cached?.accounts && !force) {
      if (outlook) {
        setOutlookRows(cached.accounts);
        const text = outlookText(cached.accounts, "all", "all");
        setMailText(text);
        setSavedText(text);
      } else {
        const text = cached.accounts.map(formatMailLine).join("\n");
        setMailText(text);
        setSavedText(text);
      }
      setLoadingMails(false);
      return;
    }
    setLoadingMails(true);
    try {
      const data = await fetchJson<{ accounts: MailAccountRow[] }>(
        key,
        `/api/mail-accounts?mailboxId=${encodeURIComponent(id)}`,
        force
      );
      if (!data?.accounts) return;
      if (outlook) {
        setOutlookRows(data.accounts);
        const text = outlookText(data.accounts, "all", "all");
        setMailText(text);
        setSavedText(text);
      } else {
        const text = data.accounts.map(formatMailLine).join("\n");
        setMailText(text);
        setSavedText(text);
      }
    } finally {
      setLoadingMails(false);
    }
  }, []);

  useEffect(() => {
    loadMailboxes();
  }, [loadMailboxes]);

  useEffect(() => {
    if (!mailboxId) {
      setMailText("");
      setSavedText("");
      setOutlookRows([]);
      return;
    }
    loadMails(mailboxId, false, isOutlook);
  }, [mailboxId, isOutlook, loadMails]);

  useEffect(() => {
    setImapPass("");
    setRevealed(false);
    setOutlookFilter("all");
    setOutlookDomain("all");
  }, [selectedSlug]);

  function notify(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  function applyOutlookView(nextFilter: OutlookFilter, nextDomain: string) {
    const source = dirty
      ? mergeOutlookText(outlookRows, mailText, outlookFilter, outlookDomain)
      : outlookRows;
    if (dirty) setOutlookRows(source);
    setOutlookFilter(nextFilter);
    setOutlookDomain(nextDomain);
    const text = outlookText(source, nextFilter, nextDomain);
    setMailText(text);
    setSavedText(text);
  }

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  }

  async function saveImapPassword() {
    if (!selected || !imapPass.trim()) return;
    setSavingImap(true);
    try {
      const res = await fetch(`/api/mailboxes/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: imapPass.trim() }),
      });
      if (!res.ok) {
        notify("Could not save IMAP password");
        return;
      }
      setImapPass("");
      dropCachePrefix("inbox");
      await loadMailboxes(true);
      notify("IMAP password saved");
    } finally {
      setSavingImap(false);
    }
  }

  async function saveMails() {
    if (!mailboxId) return;
    setSavingMails(true);
    try {
      const text = isOutlook
        ? mergeOutlookText(outlookRows, mailText, outlookFilter, outlookDomain)
            .map(formatMailLine)
            .join("\n")
        : mailText;
      const res = await fetch("/api/mail-accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailboxId, text }),
      });
      const data = (await res.json()) as { count?: number; error?: string };
      if (!res.ok) {
        notify(data.error || "Could not save mails");
        return;
      }
      if (isOutlook) {
        setOutlookFilter("all");
        setOutlookDomain("all");
      }
      await Promise.all([loadMails(mailboxId, true, isOutlook), loadMailboxes(true)]);
      notify(`${data.count ?? 0} mail${data.count === 1 ? "" : "s"} saved`);
    } finally {
      setSavingMails(false);
    }
  }

  const imapHost = selected ? `${selected.host}:${selected.port}` : "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <PageHeader page="mails" />

      {loadingBoxes ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--carbon-text-muted)]" />
        </div>
      ) : !selected ? (
        <MailGrid mailboxes={mailboxes} onPickSlug={setSelectedSlug} />
      ) : (
        <section>
          <button
            type="button"
            onClick={() => setSelectedSlug(null)}
            className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All mailboxes
          </button>

          <div className="mb-4">
            <h2 className="text-[15px] font-medium text-[var(--carbon-text)]">{selected.name}</h2>
            <p className="mt-0.5 text-xs text-[var(--carbon-text-muted)]">
              {isOutlook
                ? `${outlookCounts.account} account${outlookCounts.account === 1 ? "" : "s"} · ${outlookCounts.alias} alias${outlookCounts.alias === 1 ? "" : "es"}`
                : `${selected.total} mail${selected.total === 1 ? "" : "s"}`}
            </p>
          </div>

          {!isOutlook && (
            <div className="carbon-card mb-4 p-4">
              <p className="carbon-section-header mb-3">IMAP</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <ImapField
                  label="Host"
                  value={imapHost}
                  copied={copied === `${selected.id}-host`}
                  onCopy={() => copyValue(`${selected.id}-host`, imapHost)}
                />
                <ImapField
                  label="Mail"
                  value={selected.email}
                  copied={copied === `${selected.id}-email`}
                  onCopy={() => copyValue(`${selected.id}-email`, selected.email)}
                />
                <div>
                  <p className="mb-1 text-[11px] text-[var(--carbon-text-muted)]">Password</p>
                  {selected.password ? (
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`select-none font-mono text-[13px] ${
                          revealed ? "text-white" : "tracking-widest text-[var(--carbon-text-muted)]"
                        }`}
                      >
                        {revealed ? selected.password : "•••• •••• •••• ••••"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRevealed((v) => !v)}
                        className="text-[var(--carbon-text-muted)] hover:text-white"
                        title={revealed ? "Hide" : "Show"}
                      >
                        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <CopyBtn
                        ok={copied === `${selected.id}-pass`}
                        onClick={() => copyValue(`${selected.id}-pass`, selected.password!)}
                      />
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={imapPass}
                        onChange={(e) => setImapPass(e.target.value)}
                        placeholder="App password"
                        className="carbon-input flex-1 py-1.5 font-mono text-[12px]"
                      />
                      <button
                        type="button"
                        disabled={savingImap || !imapPass.trim()}
                        onClick={saveImapPassword}
                        className="carbon-btn-secondary px-2.5 py-1.5 text-[12px]"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {flash && <p className="mb-3 text-[12px] text-[var(--carbon-text-secondary)]">{flash}</p>}

          <div className="carbon-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="carbon-section-header">Mails{mailCount ? ` · ${mailCount}` : ""}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!mailText.trim()}
                  onClick={() => {
                    const blob = new Blob([mailText.replace(/\n/g, "\r\n")], {
                      type: "text/plain;charset=utf-8",
                    });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `${selected.slug}-emails.txt`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                  className="carbon-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
                <button
                  type="button"
                  disabled={!mailText.trim()}
                  onClick={() => copyValue("list", mailText)}
                  className="carbon-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
                >
                  {copied === "list" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy
                </button>
                <button
                  type="button"
                  disabled={!dirty || savingMails}
                  onClick={saveMails}
                  className="carbon-btn-primary px-3 py-1.5 text-[12px]"
                >
                  {savingMails ? "Saving…" : "Save"}
                </button>
              </div>
            </div>

            {isOutlook && (
              <div className="mb-3 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <Chip
                    label="All"
                    active={outlookFilter === "all"}
                    onClick={() => applyOutlookView("all", outlookDomain)}
                  />
                  <Chip
                    label="Account"
                    active={outlookFilter === "account"}
                    onClick={() => applyOutlookView("account", outlookDomain)}
                  />
                  <Chip
                    label="Alias"
                    active={outlookFilter === "alias"}
                    onClick={() => applyOutlookView("alias", outlookDomain)}
                  />
                </div>
                {outlookCounts.domains.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {outlookCounts.domains.map(([domain, count]) => (
                      <Chip
                        key={domain}
                        label={`@${domain} · ${count}`}
                        active={outlookDomain === domain}
                        onClick={() =>
                          applyOutlookView(
                            outlookFilter,
                            outlookDomain === domain ? "all" : domain
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {loadingMails ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--carbon-text-muted)]" />
              </div>
            ) : (
              <textarea
                value={mailText}
                onChange={(e) => setMailText(e.target.value)}
                rows={Math.min(24, Math.max(12, Math.min(mailCount + 2, 24)))}
                spellCheck={false}
                placeholder={
                  isOutlook
                    ? "one email per line\nname@outlook.com"
                    : "one email per line\nname@icloud.com"
                }
                className="w-full resize-y rounded-lg border border-[var(--carbon-border)] bg-[var(--carbon-bg)] px-3 py-2 font-mono text-[12px] leading-6 text-white placeholder-[var(--carbon-text-muted)] focus:border-[var(--carbon-primary)] focus:outline-none"
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
        active
          ? "bg-[var(--carbon-primary)]/15 text-[var(--carbon-primary)]"
          : "border border-[var(--carbon-border)] bg-[var(--carbon-bg-elevated)] text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
      }`}
    >
      {label}
    </button>
  );
}

function ImapField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-[var(--carbon-text-muted)]">{label}</p>
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="truncate font-mono text-[13px] text-[var(--carbon-text)]">{value}</p>
        <CopyBtn ok={copied} onClick={onCopy} />
      </div>
    </div>
  );
}

function CopyBtn({ ok, onClick }: { ok: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[var(--carbon-text-muted)] hover:text-emerald-400"
      title="Copy"
    >
      {ok ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}
