"use client";

import { useMemo } from "react";
import { ArrowLeft, KeyRound, Layers, MessageSquare, ScanSearch } from "lucide-react";
import { API_PROVIDERS, KEY_GROUPS, type ApiGroup } from "@/lib/apiProviders";

type KeyRow = {
  slug: string;
  group: string;
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

function Card({
  title,
  subtitle,
  value,
  configured,
  icon: Icon,
  onClick,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  configured?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="carbon-card flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[var(--carbon-bg-hover)]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--carbon-bg)]">
        <Icon className="h-5 w-5 text-[var(--carbon-text-muted)]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-[var(--carbon-text)]">
          <span className="truncate">{title}</span>
          {configured && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.25)]" title="Key saved" />
          )}
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] text-[var(--carbon-text-muted)]">{subtitle}</p>
        )}
      </div>
      {value && (
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--carbon-text-muted)]">
          {value}
        </span>
      )}
    </button>
  );
}

function balanceLabel(
  slug: string,
  bySlug: Map<string, KeyRow>,
  balances: Record<string, BalanceRow>
) {
  const row = bySlug.get(slug);
  const bal = balances[slug];
  const def = API_PROVIDERS.find((p) => p.slug === slug);
  if (!row?.apiKey) return "No key";
  if (!def?.balance || bal?.unsupported) return "Saved";
  if (bal?.error) return "Error";
  if (bal?.amount == null) return "…";
  return money(bal.amount, bal.currency);
}

function groupIcon(id: ApiGroup, drilldown = false) {
  if (id === "sms") return MessageSquare;
  if (id === "aycd") return Layers;
  return drilldown ? ScanSearch : KeyRound;
}

export default function KeyGrid({
  keys,
  balances,
  groupId,
  onBack,
  onPickGroup,
  onPickSlug,
}: {
  keys: KeyRow[];
  balances: Record<string, BalanceRow>;
  groupId: ApiGroup | null;
  onBack: () => void;
  onPickGroup: (group: ApiGroup) => void;
  onPickSlug: (slug: string) => void;
}) {
  const bySlug = useMemo(() => new Map(keys.map((k) => [k.slug, k])), [keys]);
  const group = KEY_GROUPS.find((g) => g.id === groupId) ?? null;

  if (group) {
    const providers = API_PROVIDERS.filter((p) => p.group === group.id);
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All providers
        </button>
        <h2 className="mb-3 text-[15px] font-medium text-[var(--carbon-text)]">{group.name}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {providers.map((p) => (
            <Card
              key={p.slug}
              title={p.name}
              subtitle={p.slug}
              value={balanceLabel(p.slug, bySlug, balances)}
              configured={Boolean(bySlug.get(p.slug)?.apiKey.trim())}
              icon={groupIcon(group.id, true)}
              onClick={() => onPickSlug(p.slug)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {KEY_GROUPS.map((g) => {
        const slugs = API_PROVIDERS.filter((p) => p.group === g.id).map((p) => p.slug);
        const saved = slugs.filter((slug) => bySlug.get(slug)?.apiKey.trim()).length;
        return (
          <Card
            key={g.id}
            title={g.name}
            subtitle={`${saved}/${slugs.length} keys saved`}
            configured={saved > 0}
            icon={groupIcon(g.id)}
            onClick={() => onPickGroup(g.id)}
          />
        );
      })}
    </div>
  );
}
