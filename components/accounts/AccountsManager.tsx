"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileUp, Loader2, Search, ShieldAlert } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { ACCOUNT_STATUSES, PLATFORM_CATALOG, isTicketmasterSlug, logoContain, logoFor, type AccountStatus } from "@/lib/sites";
import PlatformGrid from "./PlatformGrid";
import ExportCsv from "./ExportCsv";
import AccountsSheet from "./AccountsSheet";
import { dropCache, fetchJson, peekCache, setCache } from "@/lib/vaultCache";

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
  kyc?: number;
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

export default function AccountsManager() {
  const [sites, setSites] = useState<SiteRow[]>(() => peekCache<{ sites: SiteRow[] }>("sites")?.sites ?? []);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loadingSites, setLoadingSites] = useState(() => !peekCache("sites"));
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const kycRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => sites.find((s) => s.slug === selectedSlug) ?? null, [sites, selectedSlug]);
  const siteId = selected?.id ?? null;

  const loadSites = useCallback(async (force = false) => {
    const cached = peekCache<{ sites: SiteRow[] }>("sites");
    if (cached?.sites && !force) {
      setSites(cached.sites);
      setLoadingSites(false);
      return;
    }
    const data = await fetchJson<{ sites: SiteRow[] }>("sites", "/api/sites", force);
    if (data?.sites) setSites(data.sites);
    setLoadingSites(false);
  }, []);

  const loadAccounts = useCallback(async (id: string, force = false) => {
    const key = `accounts:${id}`;
    const cached = peekCache<{ accounts: AccountRow[] }>(key);
    if (cached?.accounts && !force) {
      setAccounts(cached.accounts);
      setLoadingAccounts(false);
      return;
    }
    setLoadingAccounts(true);
    try {
      const data = await fetchJson<{ accounts: AccountRow[] }>(
        key,
        `/api/accounts?siteId=${encodeURIComponent(id)}`,
        force
      );
      if (data?.accounts) setAccounts(data.accounts);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 120);
    return () => clearTimeout(t);
  }, [searchInput]);

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
    setSearchInput("");
    setStatusFilter("all");
    const site = sites.find((s) => s.slug === slug);
    const cached = site ? peekCache<{ accounts: AccountRow[] }>(`accounts:${site.id}`) : undefined;
    setAccounts(cached?.accounts ?? []);
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
      await Promise.all([loadAccounts(siteId, true), loadSites(true)]);
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

  async function importKyc(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/accounts/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as { flagged?: number; error?: string };
      if (!res.ok) {
        notify(data.error || "KYC import failed");
        return;
      }
      for (const site of sites) {
        if (isTicketmasterSlug(site.slug)) dropCache(`accounts:${site.id}`);
      }
      await Promise.all([siteId ? loadAccounts(siteId, true) : Promise.resolve(), loadSites(true)]);
      notify(`${data.flagged ?? 0} account${data.flagged === 1 ? "" : "s"} flagged KYC`);
    } finally {
      setBusy(false);
      if (kycRef.current) kycRef.current.value = "";
    }
  }

  const showKycImport = Boolean(
    openGroup === "ticketmaster" || (selected && isTicketmasterSlug(selected.slug))
  );

  function kycButton() {
    return (
      <>
        <input
          ref={kycRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => void importKyc(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => kycRef.current?.click()}
          className="carbon-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-[13px] hover:text-[var(--carbon-error)]"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Import KYC
        </button>
      </>
    );
  }

  const persistAccounts = useCallback((id: string, next: AccountRow[]) => {
    setCache(`accounts:${id}`, { accounts: next });
    return next;
  }, []);

  const setStatus = useCallback(async (id: string, status: AccountStatus) => {
    setAccounts((prev) => persistAccounts(siteId ?? prev[0]?.siteId ?? "", prev.map((a) => (a.id === id ? { ...a, status } : a))));
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }, [persistAccounts, siteId]);

  const deleteAccount = useCallback(async (id: string) => {
    setAccounts((prev) => persistAccounts(siteId ?? prev[0]?.siteId ?? "", prev.filter((a) => a.id !== id)));
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
  }, [persistAccounts, siteId]);

  const patchAccount = useCallback(async (id: string, data: Partial<AccountRow>) => {
    setAccounts((prev) => persistAccounts(siteId ?? prev[0]?.siteId ?? "", prev.map((a) => (a.id === id ? { ...a, ...data } : a))));
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }, [persistAccounts, siteId]);

  return (
    <div className={`mx-auto px-4 py-6 lg:px-6 ${selected ? "max-w-[1600px]" : "max-w-6xl"}`}>
      <PageHeader page="accounts" />

      {loadingSites ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--carbon-text-muted)]" />
        </div>
      ) : !selected ? (
        <div>
          {showKycImport && (
            <div className="mb-4 flex justify-end">
              {kycButton()}
            </div>
          )}
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
        </div>
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
                    {selected.kyc ? ` · ${selected.kyc} kyc` : ""}
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
                  {showKycImport && kycButton()}
                  <ExportCsv accounts={accounts} siteName={selected.name} search={search} />
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--carbon-text-muted)]" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
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
                          ? s === "kyc"
                            ? "bg-[var(--carbon-error)]/20 text-[var(--carbon-error)]"
                            : "bg-[var(--carbon-primary)]/15 text-[var(--carbon-primary)]"
                          : s === "kyc"
                            ? "border border-[var(--carbon-error)]/40 bg-[var(--carbon-bg-elevated)] text-[var(--carbon-error)] hover:text-[#fca5a5]"
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
                ) : accounts.length === 0 ? (
                  <p className="px-5 py-12 text-center text-sm text-[var(--carbon-text-muted)]">
                    No accounts yet. Import a CSV to get started.
                  </p>
                ) : (
                  <div className="p-2">
                    <AccountsSheet
                      key={siteId}
                      siteId={siteId!}
                      rows={shown}
                      onStatus={setStatus}
                      onDelete={deleteAccount}
                      onPatch={patchAccount}
                    />
                  </div>
                )}
              </div>
        </section>
      )}
    </div>
  );
}
