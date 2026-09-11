"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";

type SiteRow = { slug: string; name: string; total: number };
type AccountRow = { id: string; login: string; notes: string | null; createdAt: string };

function countryOf(notes: string | null): string {
  const m = /\s([A-Z]{2})\s/.exec(notes ?? "");
  return m ? m[1] : "—";
}

export default function SignupsManager() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // catégorie ouverte
  const [current, setCurrent] = useState<SiteRow | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [query, setQuery] = useState("");

  const notify = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  };

  const loadSites = useCallback(async () => {
    try {
      const d = await fetch("/api/signups").then((r) => r.json());
      setSites(d.sites ?? []);
    } catch {
      setError("Impossible de charger les catégories de sign-ups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  const openCategory = useCallback(async (site: SiteRow) => {
    setCurrent(site);
    setLoadingAccounts(true);
    setQuery("");
    try {
      const d = await fetch(`/api/signups?site=${encodeURIComponent(site.slug)}`).then((r) => r.json());
      setAccounts(d.accounts ?? []);
    } catch {
      setError("Impossible de charger les comptes");
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.login.toLowerCase().includes(q) || countryOf(a.notes).toLowerCase().includes(q),
    );
  }, [accounts, query]);

  async function createCategory() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        notify("Could not create category");
        return;
      }
      setNewName("");
      setShowCreate(false);
      await loadSites();
      notify(`Category "${name}" created`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteCategory(site: SiteRow) {
    if (!confirm(`Delete "${site.name}" and its ${site.total} mails?`)) return;
    const res = await fetch(`/api/signups?site=${encodeURIComponent(site.slug)}`, { method: "DELETE" });
    if (!res.ok) {
      notify("Could not delete category");
      return;
    }
    if (current?.slug === site.slug) setCurrent(null);
    await loadSites();
    notify(`Category "${site.name}" deleted`);
  }

  function exportCsv() {
    const rows = [
      ["email", "country", "date"],
      ...filtered.map((a) => [a.login, countryOf(a.notes), new Date(a.createdAt).toISOString()]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${current?.slug ?? "signups"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- vue catégorie ----------
  if (current) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <button
          type="button"
          onClick={() => setCurrent(null)}
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All sign-ups
        </button>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{current.name}</h1>
          <button
            type="button"
            onClick={() => deleteCategory(current)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--carbon-border)] px-2.5 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
        <p className="mt-1 text-[13px] text-[var(--carbon-text-muted)]">
          {accounts.length} mail{accounts.length === 1 ? "" : "s"} déjà utilisé
          {accounts.length === 1 ? "" : "s"} pour {current.name}.
        </p>

        {flash && <p className="mt-3 text-[13px] text-emerald-400">{flash}</p>}
        {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un mail ou un pays…"
            className="min-w-64 flex-1 rounded-lg border border-[var(--carbon-border)] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--carbon-text-muted)]"
          />
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg border border-[var(--carbon-border)] px-3 py-2 text-[12.5px] font-medium hover:bg-[var(--carbon-bg-hover)]"
          >
            Export CSV
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--carbon-border)]">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-[var(--carbon-bg-hover)] text-[11px] uppercase tracking-wide text-[var(--carbon-text-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Pays</th>
                <th className="px-3 py-2 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((a) => (
                <tr key={a.id} className="border-t border-[var(--carbon-border)]">
                  <td className="px-3 py-1.5 font-mono text-[12px]">{a.login}</td>
                  <td className="px-3 py-1.5">{countryOf(a.notes)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--carbon-text-muted)]">
                    {new Date(a.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-[var(--carbon-text-muted)]">
                    {loadingAccounts ? "Chargement…" : "Aucun résultat"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 500 && (
          <p className="mt-2 text-[12px] text-[var(--carbon-text-muted)]">
            500 premiers affichés sur {filtered.length} — utilise la recherche ou l&apos;export CSV.
          </p>
        )}
      </div>
    );
  }

  // ---------- grille des catégories ----------
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader page="signups" />
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--carbon-border)] px-3 py-2 text-[12.5px] font-medium hover:bg-[var(--carbon-bg-hover)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Créer
        </button>
      </div>
      {flash && <p className="mt-3 text-[13px] text-emerald-400">{flash}</p>}
      {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
      {loading ? (
        <p className="mt-4 text-[13px] text-[var(--carbon-text-muted)]">Chargement…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {sites.map((s) => (
              <div key={s.slug} className="carbon-card group relative">
                <button
                  type="button"
                  onClick={() => openCategory(s)}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--carbon-bg)] text-[13px] font-semibold uppercase text-[var(--carbon-text-muted)]">
                    {s.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--carbon-text)]">{s.name}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--carbon-text-muted)]">sign-ups</span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-[var(--carbon-text-muted)]">{s.total}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteCategory(s)}
                  title={`Supprimer ${s.name}`}
                  className="absolute right-1.5 top-1.5 hidden rounded-md p-1 text-[var(--carbon-text-muted)] hover:bg-red-500/10 hover:text-red-400 group-hover:block"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {!sites.length && (
              <p className="col-span-full text-[13px] text-[var(--carbon-text-muted)]">
                Aucune catégorie pour l&apos;instant — crée-en une ou importe depuis Discord.
              </p>
            )}
          </div>

          {showCreate && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
              onClick={() => setShowCreate(false)}
            >
              <div
                className="w-full max-w-sm rounded-xl border border-[var(--carbon-border)] bg-[var(--carbon-bg)] p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-[14px] font-semibold">Nouvelle catégorie de sign-ups</h2>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createCategory()}
                  placeholder="Nom de l'event (ex. Harry Style)…"
                  className="mt-3 w-full rounded-lg border border-[var(--carbon-border)] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--carbon-text-muted)]"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="rounded-lg border border-[var(--carbon-border)] px-3 py-1.5 text-[12.5px] hover:bg-[var(--carbon-bg-hover)]"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={createCategory}
                    disabled={creating || !newName.trim()}
                    className="rounded-lg border border-[var(--carbon-border)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[var(--carbon-bg-hover)] disabled:opacity-50"
                  >
                    {creating ? "Création…" : "Créer"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
