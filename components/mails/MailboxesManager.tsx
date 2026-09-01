"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Download, Eye, EyeOff, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { MAIL_GROUPS } from "@/lib/mailboxes";
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
};

export default function MailboxesManager() {
  const [mailboxes, setMailboxes] = useState<MailboxRow[]>(
    () => peekCache<{ mailboxes: MailboxRow[] }>("mailboxes")?.mailboxes ?? []
  );
  const [loadingBoxes, setLoadingBoxes] = useState(() => !peekCache("mailboxes"));
  const [loadingMails, setLoadingMails] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [imapPass, setImapPass] = useState("");
  const [savingImap, setSavingImap] = useState(false);
  const [mailText, setMailText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [savingMails, setSavingMails] = useState(false);

  const selected = mailboxes.find((m) => m.slug === selectedSlug) ?? null;
  const mailboxId = selected?.id ?? null;
  const dirty = mailText !== savedText;
  const mailCount = mailText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;

  const loadMailboxes = useCallback(async (force = false) => {
    const cached = peekCache<{ mailboxes: MailboxRow[] }>("mailboxes");
    if (cached?.mailboxes && !force) {
      setMailboxes(cached.mailboxes);
      setLoadingBoxes(false);
      return;
    }
    const data = await fetchJson<{ mailboxes: MailboxRow[] }>("mailboxes", "/api/mailboxes", force);
    if (data?.mailboxes) setMailboxes(data.mailboxes);
    setLoadingBoxes(false);
  }, []);

  const loadMails = useCallback(async (id: string, force = false) => {
    const key = `mail-accounts:${id}`;
    const cached = peekCache<{ accounts: MailAccountRow[] }>(key);
    if (cached?.accounts && !force) {
      const text = cached.accounts.map((a) => a.login).join("\n");
      setMailText(text);
      setSavedText(text);
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
      const text = data.accounts.map((a) => a.login).join("\n");
      setMailText(text);
      setSavedText(text);
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
      return;
    }
    loadMails(mailboxId);
  }, [mailboxId, loadMails]);

  useEffect(() => {
    setImapPass("");
    setRevealed(false);
  }, [selectedSlug]);

  function notify(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  function pickSlug(slug: string) {
    setSelectedSlug(slug);
  }

  function goBack() {
    if (selectedSlug && openGroup) {
      setSelectedSlug(null);
      return;
    }
    setSelectedSlug(null);
    setOpenGroup(null);
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
      const res = await fetch("/api/mail-accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailboxId, text: mailText }),
      });
      const data = (await res.json()) as { count?: number; error?: string };
      if (!res.ok) {
        notify(data.error || "Could not save mails");
        return;
      }
      await Promise.all([loadMails(mailboxId, true), loadMailboxes(true)]);
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
        <MailGrid
          mailboxes={mailboxes}
          groupId={openGroup}
          onBack={goBack}
          onPickGroup={(group) => setOpenGroup(group.id)}
          onPickSlug={pickSlug}
        />
      ) : (
        <section>
          <button
            type="button"
            onClick={goBack}
            className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {openGroup
              ? MAIL_GROUPS.find((g) => g.id === openGroup)?.name ?? "Back"
              : "All mailboxes"}
          </button>

          <div className="mb-4">
            <h2 className="text-[15px] font-medium text-[var(--carbon-text)]">{selected.name}</h2>
            <p className="mt-0.5 text-xs text-[var(--carbon-text-muted)]">
              {selected.total} mail{selected.total === 1 ? "" : "s"}
            </p>
          </div>

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

          {flash && <p className="mb-3 text-[12px] text-[var(--carbon-text-secondary)]">{flash}</p>}

          <div className="carbon-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="carbon-section-header">
                Mails{mailCount ? ` · ${mailCount}` : ""}
              </p>
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
            {loadingMails ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--carbon-text-muted)]" />
              </div>
            ) : (
              <textarea
                value={mailText}
                onChange={(e) => setMailText(e.target.value)}
                rows={Math.min(24, Math.max(12, mailCount + 2))}
                spellCheck={false}
                placeholder={"one email per line\nname@icloud.com"}
                className="w-full resize-y rounded-lg border border-[var(--carbon-border)] bg-[var(--carbon-bg)] px-3 py-2 font-mono text-[12px] leading-6 text-white placeholder-[var(--carbon-text-muted)] focus:border-[var(--carbon-primary)] focus:outline-none"
              />
            )}
          </div>
        </section>
      )}
    </div>
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
