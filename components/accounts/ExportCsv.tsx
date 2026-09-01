"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { ACCOUNT_STATUSES, type AccountStatus } from "@/lib/sites";
import type { AccountRow } from "./AccountsManager";

const COLUMNS = [
  { id: "email", label: "email", required: true },
  { id: "password", label: "password", required: true },
  { id: "phone", label: "phone" },
  { id: "first_name", label: "first_name" },
  { id: "last_name", label: "last_name" },
  { id: "birth_date", label: "birth_date" },
  { id: "notes", label: "notes" },
  { id: "status", label: "status" },
] as const;

type ColId = (typeof COLUMNS)[number]["id"];

function csvCell(v: string) {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function valueOf(a: AccountRow, col: ColId) {
  switch (col) {
    case "email":
      return a.login;
    case "password":
      return a.password ?? "";
    case "phone":
      return a.phone ?? "";
    case "first_name":
      return a.firstName ?? "";
    case "last_name":
      return a.lastName ?? "";
    case "birth_date":
      return a.birthDate ?? "";
    case "notes":
      return a.notes ?? "";
    case "status":
      return a.status;
  }
}

export default function ExportCsv({
  accounts,
  siteName,
  search,
}: {
  accounts: AccountRow[];
  siteName: string;
  search: string;
}) {
  const [open, setOpen] = useState(false);
  const [cols, setCols] = useState<Set<ColId>>(() => new Set(["email", "password"]));
  const [statuses, setStatuses] = useState<Set<AccountStatus>>(
    () => new Set(ACCOUNT_STATUSES)
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (!statuses.has(a.status)) return false;
      if (!q) return true;
      return [a.login, a.phone, a.firstName, a.lastName, a.notes]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [accounts, search, statuses]);

  function toggleCol(id: ColId, required?: boolean) {
    if (required) return;
    setCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleStatus(s: AccountStatus) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        if (next.size === 1) return prev;
        next.delete(s);
      } else next.add(s);
      return next;
    });
  }

  function download() {
    const ordered = COLUMNS.filter((c) => cols.has(c.id));
    const header = ordered.map((c) => c.label).join(",");
    const body = rows
      .map((a) => ordered.map((c) => csvCell(valueOf(a, c.id))).join(","))
      .join("\n");
    const csv = `${header}\n${body}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    a.href = url;
    a.download = `${slug || "accounts"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="carbon-btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-[13px]"
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[320px] carbon-card p-3 shadow-xl">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--carbon-text-muted)]">
            Columns
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {COLUMNS.map((c) => {
              const on = cols.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCol(c.id, "required" in c && c.required)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    on
                      ? "bg-white text-[#0c0e0f]"
                      : "border border-[var(--carbon-border)] text-[var(--carbon-text-muted)] hover:text-white"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--carbon-text-muted)]">
            Status
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ACCOUNT_STATUSES.map((s) => {
              const on = statuses.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium capitalize ${
                    on
                      ? "bg-white text-[#0c0e0f]"
                      : "border border-[var(--carbon-border)] text-[var(--carbon-text-muted)] hover:text-white"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {search.trim() && (
            <p className="mb-2 text-[11px] text-[var(--carbon-text-muted)]">
              Search filter is applied
            </p>
          )}
          <button
            type="button"
            onClick={download}
            disabled={rows.length === 0}
            className="carbon-btn-primary w-full px-3 py-2 text-[13px]"
          >
            Download {rows.length} account{rows.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}
