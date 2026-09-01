"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { API_PROVIDERS, KEY_GROUPS, type ApiGroup } from "@/lib/apiProviders";
import { fetchJson, peekCache } from "@/lib/vaultCache";
import KeyGrid from "./KeyGrid";

type KeyRow = {
  id: string;
  group: "sms" | "solver" | string;
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
  const [balances, setBalances] = useState<Record<string, BalanceRow>>({});
  const [loading, setLoading] = useState(() => !peekCache("keys"));
  const [loadingBal, setLoadingBal] = useState(false);
  const [openGroup, setOpenGroup] = useState<ApiGroup | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const selected = keys.find((k) => k.slug === selectedSlug) ?? null;
  const def = selected ? API_PROVIDERS.find((p) => p.slug === selected.slug) : null;
  const bal = selected ? balances[selected.slug] : null;

  const loadKeys = useCallback(async () => {
    const data = await fetchJson<{ keys: KeyRow[] }>("keys", "/api/keys", true);
    if (data?.keys) setKeys(data.keys);
    setLoading(false);
  }, []);

  const loadBalances = useCallback(async () => {
    setLoadingBal(true);
    try {
      const res = await fetch("/api/keys/balances");
      if (!res.ok) return;
      const data = (await res.json()) as { balances: BalanceRow[] };
      const map: Record<string, BalanceRow> = {};
      for (const b of data.balances) map[b.slug] = b;
      setBalances(map);
    } finally {
      setLoadingBal(false);
    }
  }, []);

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
      await loadKeys();
      loadBalances();
      notify("API key saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PageHeader page="keys" />
        {selected && (
          <button
            type="button"
            onClick={loadBalances}
            disabled={loadingBal}
            className="carbon-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-[13px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingBal ? "animate-spin" : ""}`} />
            Refresh balance
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--carbon-text-muted)]" />
        </div>
      ) : !selected ? (
        <KeyGrid
          keys={keys}
          balances={balances}
          groupId={openGroup}
          onBack={goBack}
          onPickGroup={setOpenGroup}
          onPickSlug={setSelectedSlug}
        />
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

          <div className="mb-4">
            <h2 className="flex items-center gap-2 text-[15px] font-medium text-[var(--carbon-text)]">
              {selected.name}
              {selected.apiKey.trim() ? (
                <span className="h-2 w-2 rounded-full bg-emerald-400" title="Key saved" />
              ) : null}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--carbon-text-muted)]">{selected.slug}</p>
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
                {!def?.balance || bal?.unsupported ? (
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
