"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Ticket,
  Store,
  Globe,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { ACCOUNT_STATUSES, type AccountStatus } from "@/lib/sites";

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

function siteIcon(slug: string) {
  if (slug.includes("ticketmaster") || slug.includes("tm")) return Ticket;
  if (slug.includes("fnac")) return Store;
  return Globe;
}

const EMPTY_FORM = {
  login: "",
  password: "",
  phone: "",
  firstName: "",
  lastName: "",
  birthDate: "",
  notes: "",
  status: "active" as AccountStatus,
};

export default function AccountsManager() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [newSite, setNewSite] = useState("");
  const [bulk, setBulk] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = sites.find((s) => s.id === siteId) ?? null;

  const loadSites = useCallback(async () => {
    const res = await fetch("/api/sites");
    if (!res.ok) return;
    const data = (await res.json()) as { sites: SiteRow[] };
    setSites(data.sites);
    setLoadingSites(false);
    setSiteId((prev) => {
      if (prev && data.sites.some((s) => s.id === prev)) return prev;
      return data.sites[0]?.id ?? null;
    });
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

  async function addSite() {
    const name = newSite.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        notify(err.error || "Could not add site");
        return;
      }
      setNewSite("");
      await loadSites();
      notify("Site added");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSite(site: SiteRow) {
    if (!confirm(`Delete "${site.name}" and all its accounts?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
      await loadSites();
      notify("Site deleted");
    } finally {
      setBusy(false);
    }
  }

  async function addBulk() {
    if (!siteId || !bulk.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, bulk }),
      });
      const data = (await res.json()) as { added?: number; error?: string };
      if (!res.ok) {
        notify(data.error || "Import failed");
        return;
      }
      setBulk("");
      await Promise.all([loadAccounts(siteId), loadSites()]);
      notify(`${data.added} account${data.added === 1 ? "" : "s"} added`);
    } finally {
      setBusy(false);
    }
  }

  async function saveForm() {
    if (!siteId || !form.login.trim()) return;
    setBusy(true);
    try {
      const payload = {
        login: form.login,
        password: form.password || null,
        phone: form.phone || null,
        firstName: form.firstName || null,
        lastName: form.lastName || null,
        birthDate: form.birthDate || null,
        notes: form.notes || null,
        status: form.status,
      };
      const res = editingId
        ? await fetch(`/api/accounts/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ siteId, ...payload }),
          });
      if (!res.ok) {
        notify("Save failed");
        return;
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setFormOpen(false);
      await Promise.all([loadAccounts(siteId), loadSites()]);
      notify(editingId ? "Account updated" : "Account added");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(a: AccountRow) {
    setEditingId(a.id);
    setForm({
      login: a.login,
      password: a.password ?? "",
      phone: a.phone ?? "",
      firstName: a.firstName ?? "",
      lastName: a.lastName ?? "",
      birthDate: a.birthDate ?? "",
      notes: a.notes ?? "",
      status: a.status,
    });
    setFormOpen(true);
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-3">
          <div className="flex gap-2">
            <input
              value={newSite}
              onChange={(e) => setNewSite(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSite()}
              placeholder="New site…"
              className="carbon-input py-2 text-[13px]"
            />
            <button
              type="button"
              onClick={addSite}
              disabled={busy || !newSite.trim()}
              className="carbon-btn-primary px-3 py-2"
              title="Add site"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {loadingSites ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--carbon-text-muted)]" />
            </div>
          ) : (
            <div className="space-y-1">
              {sites.map((site) => {
                const Icon = siteIcon(site.slug);
                const active = site.id === siteId;
                return (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => setSiteId(site.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium ${
                      active
                        ? "border border-[var(--carbon-border)] bg-[var(--carbon-bg-elevated)] text-[var(--carbon-text)]"
                        : "border border-transparent text-[var(--carbon-text-secondary)] hover:bg-[var(--carbon-bg-hover)] hover:text-[var(--carbon-text)]"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 opacity-90" />
                    <span className="min-w-0 flex-1 truncate">{site.name}</span>
                    <span className="text-[11px] text-[var(--carbon-text-muted)]">{site.total}</span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section>
          {!selected ? (
            <div className="carbon-card border-dashed px-6 py-16 text-center">
              <p className="text-[15px] font-medium text-[var(--carbon-text)]">No site yet</p>
              <p className="mt-1 text-sm text-[var(--carbon-text-secondary)]">
                Add a platform on the left to start storing accounts.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm(EMPTY_FORM);
                      setFormOpen((v) => !v);
                    }}
                    className="carbon-btn-primary px-3 py-2 text-[13px]"
                  >
                    {formOpen && !editingId ? "Close" : "Add account"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSite(selected)}
                    className="carbon-btn-secondary px-3 py-2 text-[13px] text-[var(--carbon-text-muted)] hover:text-[var(--carbon-error)]"
                  >
                    Delete site
                  </button>
                </div>
              </div>

              {formOpen && (
                <div className="carbon-card mb-4 p-4">
                  <p className="mb-3 text-[13px] font-medium">
                    {editingId ? "Edit account" : "New account"}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Login / email" value={form.login} onChange={(v) => setForm({ ...form, login: v })} />
                    <Field
                      label="Password"
                      value={form.password}
                      onChange={(v) => setForm({ ...form, password: v })}
                      type="text"
                    />
                    <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                    <Field
                      label="Birth date"
                      value={form.birthDate}
                      onChange={(v) => setForm({ ...form, birthDate: v })}
                      placeholder="DD/MM/YYYY"
                    />
                    <Field
                      label="First name"
                      value={form.firstName}
                      onChange={(v) => setForm({ ...form, firstName: v })}
                    />
                    <Field
                      label="Last name"
                      value={form.lastName}
                      onChange={(v) => setForm({ ...form, lastName: v })}
                    />
                    <div className="sm:col-span-2">
                      <Field label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
                    </div>
                    <div>
                      <label className="carbon-label">Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value as AccountStatus })}
                        className="carbon-select py-2"
                      >
                        {ACCOUNT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFormOpen(false);
                        setEditingId(null);
                        setForm(EMPTY_FORM);
                      }}
                      className="carbon-btn-secondary px-3 py-2 text-[13px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveForm}
                      disabled={busy || !form.login.trim()}
                      className="carbon-btn-primary px-3 py-2 text-[13px]"
                    >
                      {editingId ? "Save" : "Add"}
                    </button>
                  </div>
                </div>
              )}

              <div className="carbon-card mb-4 p-4">
                <label className="carbon-label">Bulk import</label>
                <textarea
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  rows={3}
                  placeholder={"login:password\nmail,password,phone,first_name,last_name,birth_date"}
                  className="w-full rounded-lg border border-[var(--carbon-border)] bg-[var(--carbon-bg)] px-3 py-2 font-mono text-[12px] text-white placeholder-[var(--carbon-text-muted)] focus:border-[var(--carbon-primary)] focus:outline-none"
                />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10.5px] text-[var(--carbon-text-muted)]">
                    One line = one account · login:password or CSV
                  </span>
                  <button
                    type="button"
                    onClick={addBulk}
                    disabled={busy || !bulk.trim()}
                    className="rounded-md bg-white px-3 py-1.5 text-[12px] font-medium text-[#0c0e0f] hover:bg-gray-200 disabled:opacity-50"
                  >
                    Import
                  </button>
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
                      ? "No accounts yet. Paste them above or add one."
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
                            onClick={() => startEdit(a)}
                            className="rounded-lg p-1.5 text-[var(--carbon-text-muted)] hover:bg-[var(--carbon-bg-hover)] hover:text-white"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
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
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="carbon-label">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="carbon-input py-2"
      />
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
