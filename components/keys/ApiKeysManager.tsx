"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { API_PROVIDERS, KEY_GROUPS, type ApiGroup } from "@/lib/apiProviders";
import { fetchJson, peekCache } from "@/lib/vaultCache";
import KeyGrid from "./KeyGrid";

type KeyRow = {
  id: string;
  group: "sms" | "solver" | "aycd" | string;
  slug: string;
  name: string;
  apiKey: string;
};

type BalanceRow = {
  slug: string;
  amount: number | null;
  currency: string | null;
  error: string | null;
  unsupported: boolean;
};

function money(amount: number, currency: string | null) {
  const code = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount);
  } catch {
    return `${amount} ${code}`;
  }
}

export default function ApiKeysManager() {
  const [keys, setKeys] = useState<KeyRow[]>(() => peekCache<{ keys: KeyRow[] }>("keys")?.keys ?? []);
  const [balances, setBalances] = useState<Record<string, BalanceRow>>(() => {
    const rows = peekCache<{ balances: BalanceRow[] }>("balances")?.balances ?? [];
    const map: Record<string, BalanceRow> = {};
    for (const b of rows) map[b.slug] = b;
    return map;
  });
  const [loading, setLoading] = useState(() => !peekCache("keys"));
  const [loadingBal, setLoadingBal] = useState(false);
  const [openGroup, setOpenGroup] = useState<ApiGroup | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [aycdName, setAycdName] = useState("");
  const [aycdKey, setAycdKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const selected = keys.find((k) => k.slug === selectedSlug) ?? null;
  const def = selected ? API_PROVIDERS.find((p) => p.slug === selected.slug) : null;
  const bal = selected ? balances[selected.slug] : null;

  const applyBalances = useCallback((rows: BalanceRow[]) => {
    const map: Record<string, BalanceRow> = {};
    for (const b of rows) map[b.slug] = b;
    setBalances(map);
  }, []);

  const loadKeys = useCallback(async (force = false) => {
    const cached = peekCache<{ keys: KeyRow[] }>("keys");
    if (cached?.keys && !force) {
      setKeys(cached.keys);
      setLoading(false);
      return;
    }
    const data = await fetchJson<{ keys: KeyRow[] }>("keys", "/api/keys", force);
    if (data?.keys) setKeys(data.keys);
    setLoading(false);
  }, []);

  const loadBalances = useCallback(async (force = false) => {
    const cached = peekCache<{ balances: BalanceRow[] }>("balances");
    if (cached?.balances && !force) {
      applyBalances(cached.balances);
      return;
    }
    setLoadingBal(true);
    try {
      const data = await fetchJson<{ balances: BalanceRow[] }>(
        "balances",
        force ? "/api/keys/balances?force=1" : "/api/keys/balances",
        force
      );
      if (data?.balances) applyBalances(data.balances);
    } finally {
      setLoadingBal(false);
    }
  }, [applyBalances]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  useEffect(() => {
    if (openGroup || selectedSlug) loadBalances();
  }, [openGroup, selectedSlug, loadBalances]);

  useEffect(() => {
    setDraft("");
    setRevealed(false);
  }, [selectedSlug]);

  function notify(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  function goBack() {
    if (selectedSlug && openGroup) {
      setSelectedSlug(null);
      return;
    }
    setSelectedSlug(null);
    setOpenGroup(null);
  }

  async function copyKey(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function saveKey() {
    if (!selected || !draft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: selected.slug, apiKey: draft.trim() }),
      });
      if (!res.ok) {
        notify("Could not save key");
        return;
      }
      setDraft("");
      await loadKeys(true);
      loadBalances(true);
      notify("API key saved");
    } finally {
      setSaving(false);
    }
  }

  async function addAycdKey() {
    if (!aycdName.trim() || !aycdKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: "aycd", name: aycdName.trim(), apiKey: aycdKey.trim() }),
      });
      if (!res.ok) {
        notify("Could not add key");
        return;
      }
      setAycdName("");
      setAycdKey("");
      await loadKeys(true);
      notify("AYCD key saved");
    } finally {
      setSaving(false);
    }
  }

  async function testAycdKey() {
    setTesting(true);
    try {
      const res = await fetch("/api/keys/aycd/test", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        count?: number;
        from?: string | null;
        subject?: string | null;
        error?: string;
      };
      if (!data.ok) {
        notify(data.error || "AYCD Inbox test failed");
        return;
      }
      const sample = data.from || data.subject
        ? ` · ${data.from ?? "unknown"} — ${data.subject ?? "(no subject)"}`
        : "";
      notify(`AYCD OK · ${data.count ?? 0} mail${data.count === 1 ? "" : "s"}${sample}`);
    } finally {
      setTesting(false);
    }
  }

  async function deleteAycdKey() {
    if (!selected || selected.group !== "aycd") return;
    if (!confirm(`Delete ${selected.name}?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/keys?slug=${encodeURIComponent(selected.slug)}`, { method: "DELETE" });
      if (!res.ok) {
        notify("Could not delete key");
        return;
      }
      setSelectedSlug(null);
      await loadKeys(true);
      notify("AYCD key deleted");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <div className="mb-6">
        <PageHeader page="keys" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--carbon-text-muted)]" />
        </div>
      ) : !selected ? (
        <div>
          {openGroup === "aycd" && (
            <div className="carbon-card mb-4 p-4">
              <p className="carbon-section-header mb-3">Add AYCD key</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={aycdName}
                  onChange={(e) => setAycdName(e.target.value)}
                  placeholder="Name"
                  className="carbon-input py-1.5 text-[13px] sm:w-40"
                />
                <input
                  type="password"
                  value={aycdKey}
                  onChange={(e) => setAycdKey(e.target.value)}
                  placeholder="Inbox-…"
                  className="carbon-input flex-1 py-1.5 font-mono text-[12px]"
                />
                <button
                  type="button"
                  disabled={saving || !aycdName.trim() || !aycdKey.trim()}
                  onClick={() => void addAycdKey()}
                  className="carbon-btn-secondary inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[12px]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Save
                </button>
              </div>
              <p className="mt-2 text-[11px] text-[var(--carbon-text-muted)]">
                Paste your Inbox AYCD key (starts with Inbox-). Outlook Inbox uses UpLink IMAP
                first; the key is used as IMAP login if AYCD_IMAP_USER / AYCD_IMAP_PASSWORD
                are not set. Also enable IMAP Server + Remote Access on the RDP.
              </p>
              {flash && <p className="mt-3 text-[12px] text-[var(--carbon-text-secondary)]">{flash}</p>}
            </div>
          )}
          <KeyGrid
            keys={keys}
            balances={balances}
            groupId={openGroup}
            onBack={goBack}
            onPickGroup={setOpenGroup}
            onPickSlug={setSelectedSlug}
          />
        </div>
      ) : (
        <section>
          <button
            type="button"
            onClick={goBack}
            className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {openGroup ? KEY_GROUPS.find((g) => g.id === openGroup)?.name ?? "Back" : "All providers"}
          </button>

          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
            <h2 className="flex items-center gap-2 text-[15px] font-medium text-[var(--carbon-text)]">
              {selected.name}
              {selected.apiKey.trim() ? (
                <span className="h-2 w-2 rounded-full bg-emerald-400" title="Key saved" />
              ) : null}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--carbon-text-muted)]">{selected.slug}</p>
            </div>
            {selected.group === "aycd" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={testing || !selected.apiKey.trim()}
                  onClick={() => void testAycdKey()}
                  className="carbon-btn-secondary px-2.5 py-1.5 text-[12px]"
                >
                  {testing ? "Testing…" : "Test Inbox"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void deleteAycdKey()}
                  className="carbon-btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] hover:text-[var(--carbon-error)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>

          <div className="carbon-card mb-4 p-4">
            <p className="carbon-section-header mb-3">API key</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[11px] text-[var(--carbon-text-muted)]">Key</p>
                {selected.apiKey ? (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`min-w-0 truncate font-mono text-[13px] ${
                        revealed ? "text-white" : "tracking-widest text-[var(--carbon-text-muted)]"
                      }`}
                    >
                      {revealed ? selected.apiKey : "•••• •••• •••• ••••"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRevealed((v) => !v)}
                      className="text-[var(--carbon-text-muted)] hover:text-white"
                      title={revealed ? "Hide" : "Show"}
                    >
                      {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyKey(selected.apiKey)}
                      className="text-[var(--carbon-text-muted)] hover:text-emerald-400"
                      title="Copy"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="API key"
                      className="carbon-input flex-1 py-1.5 font-mono text-[12px]"
                    />
                    <button
                      type="button"
                      disabled={saving || !draft.trim()}
                      onClick={saveKey}
                      className="carbon-btn-secondary px-2.5 py-1.5 text-[12px]"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
              <div>
                <p className="mb-1 text-[11px] text-[var(--carbon-text-muted)]">Balance</p>
                {!def?.balance || selected.group === "aycd" || bal?.unsupported ? (
                  <p className="text-[13px] text-[var(--carbon-text-muted)]">No balance API</p>
                ) : loadingBal ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--carbon-text-muted)]" />
                ) : bal?.error ? (
                  <p className="text-[13px] text-[var(--carbon-error)]" title={bal.error}>
                    Error
                  </p>
                ) : bal?.amount == null ? (
                  <p className="text-[13px] text-[var(--carbon-text-muted)]">—</p>
                ) : (
                  <p className="font-mono text-[15px] text-[var(--carbon-text)]">
                    {money(bal.amount, bal.currency)}
                  </p>
                )}
              </div>
            </div>
            {flash && <p className="mt-3 text-[12px] text-[var(--carbon-text-secondary)]">{flash}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
