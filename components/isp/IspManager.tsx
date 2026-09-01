"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { fetchJson, peekCache, setCache } from "@/lib/vaultCache";

export default function IspManager() {
  const [text, setText] = useState(() => peekCache<{ text: string }>("proxies")?.text ?? "");
  const [saved, setSaved] = useState(() => peekCache<{ text: string }>("proxies")?.text ?? "");
  const [loading, setLoading] = useState(() => !peekCache("proxies"));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const dirty = text !== saved;
  const count = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;

  const load = useCallback(async () => {
    const data = await fetchJson<{ text?: string }>("proxies", "/api/proxies");
    const next = data?.text ?? "";
    setText(next);
    setSaved(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function notify(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/proxies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const raw = await res.text();
      let data: { count?: number; error?: string } = {};
      try {
        data = raw ? (JSON.parse(raw) as { count?: number; error?: string }) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        notify(data.error || "Could not save proxies");
        return;
      }
      setSaved(text);
      setCache("proxies", { text });
      notify(`${data.count ?? 0} prox${data.count === 1 ? "y" : "ies"} saved`);
    } finally {
      setSaving(false);
    }
  }

  async function copyList() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function download() {
    const blob = new Blob([text.replace(/\n/g, "\r\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "isp-proxies.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <PageHeader page="isp" />

      {flash && <p className="mb-3 text-[12px] text-[var(--carbon-text-secondary)]">{flash}</p>}

      <div className="carbon-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="carbon-section-header">Proxies{count ? ` · ${count}` : ""}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!text.trim()}
              onClick={download}
              className="carbon-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <button
              type="button"
              disabled={!text.trim()}
              onClick={copyList}
              className="carbon-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={save}
              className="carbon-btn-primary px-3 py-1.5 text-[12px]"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--carbon-text-muted)]" />
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.min(28, Math.max(14, count + 2))}
            spellCheck={false}
            placeholder={"ip:port:user:pass\nhost:port"}
            className="w-full resize-y rounded-lg border border-[var(--carbon-border)] bg-[var(--carbon-bg)] px-3 py-2 font-mono text-[12px] leading-6 text-white placeholder-[var(--carbon-text-muted)] focus:border-[var(--carbon-primary)] focus:outline-none"
          />
        )}
      </div>
    </div>
  );
}
