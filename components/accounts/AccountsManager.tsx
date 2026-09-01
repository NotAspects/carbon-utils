"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { ACCOUNT_STATUSES, PLATFORM_CATALOG, logoContain, logoFor, type AccountStatus } from "@/lib/sites";
import PlatformGrid from "./PlatformGrid";
import ExportCsv from "./ExportCsv";

export type SiteRow = {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  total: number;
  active: number;
  used: number;
  banned: number;
  inactive: number;
};

export type AccountRow = {
  id: string;
  siteId: string;
  login: string;
  password: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  notes: string | null;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
};

const STATUS_STYLE: Record<AccountStatus, string> = {
  active: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  used: "bg-[var(--carbon-bg-hover)] text-[var(--carbon-text-secondary)] border-[var(--carbon-border)]",
  banned: "bg-[var(--carbon-error)]/15 text-[var(--carbon-error)] border-[var(--carbon-error)]/20",
  inactive: "bg-[var(--carbon-bg-hover)] text-[var(--carbon-text-muted)] border-[var(--carbon-border)]",
};

export default function AccountsManager() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = sites.find((s) => s.slug === selectedSlug) ?? null;
  const siteId = selected?.id ?? null;

  const loadSites = useCallback(async () => {
    const res = await fetch("/api/sites");
    if (!res.ok) return;
    const data = (await res.json()) as { sites: SiteRow[] };
    setSites(data.sites);
    setLoadingSites(false);
  }, []);

  const loadAccounts = useCallback(async (id: string) => {
    setLoadingAccounts(true);
    try {
      const res = await fetch(`/api/accounts?siteId=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { accounts: AccountRow[] };
      setAccounts(data.accounts);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  useEffect(() => {
    if (!siteId) {
      setAccounts([]);
      return;
    }
    loadAccounts(siteId);
  }, [siteId, loadAccounts]);

  function notify(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!q) return true;
      return [a.login, a.phone, a.firstName, a.lastName, a.notes]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [accounts, search, statusFilter]);

  function pickSlug(slug: string) {
    setSelectedSlug(slug);
    setSearch("");
    setStatusFilter("all");
    setAccounts([]);
  }

  function goBack() {
    if (selectedSlug && openGroup) {
      setSelectedSlug(null);
      setAccounts([]);
      return;
    }
    setSelectedSlug(null);
    setOpenGroup(null);
    setAccounts([]);
  }

  async function importText(text: string) {
    if (!siteId || !text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, bulk: text }),
      });
      const data = (await res.json()) as { added?: number; error?: string };
      if (!res.ok) {
        notify(data.error || "Import failed");
        return;
      }
      await Promise.all([loadAccounts(siteId), loadSites()]);
      notify(`${data.added} account${data.added === 1 ? "" : "s"} added`);
    } finally {
      setBusy(false);
    }
  }

  async function onCsvFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    await importText(text);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function setStatus(id: string, status: AccountStatus) {
    if (!siteId) return;
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadSites();
  }

  async function deleteAccount(id: string) {
    if (!siteId) return;
    if (!confirm("Delete this account?")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    loadSites();
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <PageHeader page="accounts" />

      {loadingSites ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--carbon-text-muted)]" />
        </div>
      ) : !selected ? (
        <PlatformGrid
          sites={sites}
          groupId={openGroup}
          onBack={goBack}
          onPickPlatform={(platform) => {
            if (platform.children) {
              setOpenGroup(platform.id);
              return;
            }
            if (platform.slug) pickSlug(platform.slug);
          }}
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
                  ? PLATFORM_CATALOG.find((p) => p.id === openGroup)?.name ?? "Back"
                  : "All sites"}
              </button>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {logoFor(selected.slug) && (
                    <span
                      className={`h-9 w-9 shrink-0 overflow-hidden rounded-lg ${
                        logoContain(selected.slug) ? "bg-white p-0.5" : ""
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logoFor(selected.slug)!}
                        alt=""
                        className={`h-full w-full ${
                          logoContain(selected.slug) ? "object-contain" : "object-cover"
                        }`}
                      />
                    </span>
                  )}
                  <div>
                  <h2 className="text-[15px] font-medium text-[var(--carbon-text)]">{selected.name}</h2>
                  <p className="mt-0.5 text-xs text-[var(--carbon-text-muted)]">
                    {selected.active} active
                    {selected.used ? ` · ${selected.used} used` : ""}
                    {selected.banned ? ` · ${selected.banned} banned` : ""}
                    {selected.inactive ? ` · ${selected.inactive} inactive` : ""}
                    {` · ${selected.total} total`}
                  </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="hidden"
                    onChange={(e) => onCsvFile(e.target.files?.[0])}
                  />
                  <a
                    href="/templates/accounts.csv"
                    download="accounts-template.csv"
                    className="carbon-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-[13px]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Template
                  </a>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    className="carbon-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-[13px]"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    Import CSV
                  </button>
                  <ExportCsv accounts={accounts} siteName={selected.name} search={search} />
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--carbon-text-muted)]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search login, name, phone…"
                    className="carbon-input py-2 pl-8 text-[13px]"
                  />
                </div>
                <div className="flex gap-1">
                  {(["all", ...ACCOUNT_STATUSES] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatusFilter(s)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium capitalize ${
                        statusFilter === s
                          ? "bg-[var(--carbon-primary)]/15 text-[var(--carbon-primary)]"
                          : "border border-[var(--carbon-border)] bg-[var(--carbon-bg-elevated)] text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {flash && (
                <p className="mb-3 text-[12px] text-[var(--carbon-text-secondary)]">{flash}</p>
              )}

              <div className="carbon-card overflow-hidden">
                {loadingAccounts ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--carbon-text-muted)]" />
                  </div>
                ) : shown.length === 0 ? (
                  <p className="px-5 py-12 text-center text-sm text-[var(--carbon-text-muted)]">
                    {accounts.length === 0
                      ? "No accounts yet. Import a CSV to get started."
                      : "No accounts match this filter."}
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--carbon-border)]">
                    {shown.map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate font-mono text-[13px] text-[var(--carbon-text)]">{a.login}</p>
                            <CopyBtn
                              ok={copied === `${a.id}-login`}
                              onClick={() => copyValue(`${a.id}-login`, a.login)}
                            />
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            {a.password ? (
                              <span className="inline-flex items-center gap-1">
                                <span
                                  className={`select-none font-mono text-[11px] ${
                                    revealed.has(a.id)
                                      ? "text-white"
                                      : "tracking-widest text-[var(--carbon-text-muted)]"
                                  }`}
                                >
                                  {revealed.has(a.id) ? a.password : "••••••"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleReveal(a.id)}
                                  className="text-[var(--carbon-text-muted)] hover:text-white"
                                  title={revealed.has(a.id) ? "Hide" : "Show"}
                                >
                                  {revealed.has(a.id) ? (
                                    <EyeOff className="h-3 w-3" />
                                  ) : (
                                    <Eye className="h-3 w-3" />
                                  )}
                                </button>
                                <CopyBtn
                                  ok={copied === `${a.id}-pass`}
                                  onClick={() => copyValue(`${a.id}-pass`, a.password!)}
                                />
                              </span>
                            ) : (
                              <span className="text-[11px] italic text-[var(--carbon-text-muted)]">
                                no password
                              </span>
                            )}
                            {(a.firstName || a.lastName) && (
                              <span className="text-[11px] text-[var(--carbon-text-secondary)]">
                                {[a.firstName, a.lastName].filter(Boolean).join(" ")}
                              </span>
                            )}
                            {a.phone && (
                              <span className="font-mono text-[11px] text-[var(--carbon-text-muted)]">
                                {a.phone}
                              </span>
                            )}
                            {a.notes && (
                              <span className="truncate text-[11px] text-[var(--carbon-text-muted)]">
                                {a.notes}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={a.status}
                            onChange={(e) => setStatus(a.id, e.target.value as AccountStatus)}
                            className={`rounded-md border px-1.5 py-1 text-[10px] font-medium capitalize ${STATUS_STYLE[a.status]} bg-transparent`}
                          >
                            {ACCOUNT_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => deleteAccount(a.id)}
                            className="rounded-lg p-1.5 text-[var(--carbon-text-muted)] hover:bg-[var(--carbon-bg-hover)] hover:text-[var(--carbon-error)]"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
        </section>
      )}
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
