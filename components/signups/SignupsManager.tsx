"use client";

import { useEffect, useMemo, useState } from "react";

type SiteRow = { slug: string; name: string; total: number };
type AccountRow = { id: string; login: string; notes: string | null; createdAt: string };

function countryOf(notes: string | null): string {
  const m = /\s([A-Z]{2})\s/.exec(notes ?? "");
  return m ? m[1] : "—";
}

export default function SignupsManager() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [query, setQuery] = useState("");
  const [checkText, setCheckText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/signups")
      .then((r) => r.json())
      .then((d: { sites?: SiteRow[] }) => {
        setSites(d.sites ?? []);
        if (d.sites?.length) setCurrent(d.sites[0].slug);
      })
      .catch(() => setError("Impossible de charger les sites de sign-ups"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    fetch(`/api/signups?site=${encodeURIComponent(current)}`)
      .then((r) => r.json())
      .then((d: { accounts?: AccountRow[] }) => setAccounts(d.accounts ?? []))
      .catch(() => setError("Impossible de charger les comptes"))
      .finally(() => setLoading(false));
  }, [current]);

  const usedSet = useMemo(() => new Set(accounts.map((a) => a.login.toLowerCase())), [accounts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => a.login.toLowerCase().includes(q) || countryOf(a.notes).toLowerCase().includes(q));
  }, [accounts, query]);

  const checkResults = useMemo(() => {
    const lines = checkText
      .split(/[\s,;]+/)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.includes("@"));
    if (!lines.length) return null;
    const seen = new Set<string>();
    return lines.map((l) => {
      const unique = seen.has(l) ? false : true;
      seen.add(l);
      return { mail: l, used: usedSet.has(l), duplicate: !unique };
    });
  }, [checkText, usedSet]);

  function exportCsv() {
    const rows = [["email", "country", "date"], ...filtered.map((a) => [
      a.login, countryOf(a.notes), new Date(a.createdAt).toISOString(),
    ])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${current || "signups"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const usedCount = accounts.length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="text-xl font-semibold">Sign-ups</h1>
      <p className="mt-1 text-[13px] text-[var(--carbon-text-muted)]">
        Mails déjà utilisés pour les inscriptions. Vérifie un lot de mails avant de l&apos;utiliser :
        ceux qui sortent en rouge sont à écarter de tes batchs.
      </p>

      {error && <p className="mt-4 text-[13px] text-red-400">{error}</p>}
      {loading && !accounts.length && <p className="mt-4 text-[13px] text-[var(--carbon-text-muted)]">Chargement…</p>}

      {sites.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {sites.map((s) => (
            <button
              key={s.slug}
              onClick={() => setCurrent(s.slug)}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                current === s.slug
                  ? "border-[var(--carbon-border)] bg-[var(--carbon-bg-hover)]"
                  : "border-transparent text-[var(--carbon-text-muted)] hover:bg-[var(--carbon-bg-hover)]"
              }`}
            >
              {s.name} <span className="tabular-nums opacity-70">{s.total}</span>
            </button>
          ))}
        </div>
      )}

      {/* Vérificateur de mails */}
      <div className="mt-5 rounded-xl border border-[var(--carbon-border)] p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold">Vérifier un lot de mails</h2>
          <span className="text-[12px] text-[var(--carbon-text-muted)]">
            {usedCount} mail{usedCount === 1 ? "" : "s"} déjà utilisé{usedCount === 1 ? "" : "s"}
          </span>
        </div>
        <textarea
          value={checkText}
          onChange={(e) => setCheckText(e.target.value)}
          rows={3}
          placeholder="Colle ici une liste de mails (un par ligne, ou séparés par des espaces/virgules)…"
          className="mt-2 w-full resize-y rounded-lg border border-[var(--carbon-border)] bg-transparent p-2.5 font-mono text-[12px] outline-none focus:border-[var(--carbon-text-muted)]"
        />
        {checkResults && (
          <div className="mt-2 max-h-48 overflow-y-auto font-mono text-[12px]">
            {checkResults.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                <span className={r.duplicate ? "opacity-40" : ""}>{r.mail}</span>
                <span className={r.used ? "font-medium text-red-400" : "font-medium text-emerald-400"}>
                  {r.duplicate ? "doublon" : r.used ? "DÉJÀ UTILISÉ" : "disponible"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Liste */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un mail ou un pays…"
          className="min-w-64 flex-1 rounded-lg border border-[var(--carbon-border)] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--carbon-text-muted)]"
        />
        <button
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
                  Aucun résultat
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 500 && (
        <p className="mt-2 text-[12px] text-[var(--carbon-text-muted)]">
          500 premiers affichés sur {filtered.length} — utilise la recherche ou l&apos;export CSV pour tout voir.
        </p>
      )}
    </div>
  );
}
