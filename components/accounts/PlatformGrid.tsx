"use client";

import {
  ArrowLeft,
  Dices,
  Flag,
  Globe,
  Landmark,
  Medal,
  Music,
  Scan,
  Shield,
  Sparkles,
  Ticket,
  Trophy,
} from "lucide-react";
import type { CatalogPlatform } from "@/lib/sites";
import { PLATFORM_CATALOG, logoContain, logoFor } from "@/lib/sites";
import type { SiteRow } from "./AccountsManager";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "ticketmaster-fr": Ticket,
  ticketmaster: Ticket,
  axs: Scan,
  eventim: Landmark,
  seetickets: Ticket,
  "gigs-and-tours": Music,
  tomorrowland: Sparkles,
  psg: Shield,
  "olympics-la28": Medal,
  "roland-garros": Trophy,
  fifa: Flag,
  dice: Dices,
};

function countFor(platform: CatalogPlatform, sites: SiteRow[]) {
  const slugs = platform.children?.map((c) => c.slug) ?? (platform.slug ? [platform.slug] : []);
  return slugs.reduce((sum, slug) => sum + (sites.find((s) => s.slug === slug)?.total ?? 0), 0);
}

function Card({
  title,
  subtitle,
  count,
  logo,
  contain,
  icon: Icon = Globe,
  onClick,
}: {
  title: string;
  subtitle?: string;
  count: number;
  logo?: string | null;
  contain?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="carbon-card flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[var(--carbon-bg-hover)]"
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl ${
          contain ? "bg-white p-1" : ""
        }`}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            className={`h-full w-full ${contain ? "object-contain" : "object-cover"}`}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[var(--carbon-bg)]">
            <Icon className="h-5 w-5 text-[var(--carbon-text-muted)]" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--carbon-text)]">{title}</p>
        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] text-[var(--carbon-text-muted)]">{subtitle}</p>
        )}
      </div>
      <span className="shrink-0 text-[12px] tabular-nums text-[var(--carbon-text-muted)]">{count}</span>
    </button>
  );
}

export default function PlatformGrid({
  sites,
  groupId,
  onBack,
  onPickPlatform,
  onPickSlug,
}: {
  sites: SiteRow[];
  groupId: string | null;
  onBack: () => void;
  onPickPlatform: (platform: CatalogPlatform) => void;
  onPickSlug: (slug: string) => void;
}) {
  const group = PLATFORM_CATALOG.find((p) => p.id === groupId) ?? null;

  if (group?.children) {
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All sites
        </button>
        <h2 className="mb-3 text-[15px] font-medium text-[var(--carbon-text)]">{group.name}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {group.children.map((child) => (
            <Card
              key={child.slug}
              title={child.short}
              subtitle={child.name}
              count={sites.find((s) => s.slug === child.slug)?.total ?? 0}
              logo={logoFor(child.slug) ?? logoFor(group.id)}
              contain={logoContain(child.slug) || logoContain(group.id)}
              icon={ICONS[group.id]}
              onClick={() => onPickSlug(child.slug)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {PLATFORM_CATALOG.map((platform) => {
        const n = platform.children?.length;
        const subtitle = platform.children
          ? `${n} ${platform.hint?.toLowerCase() ?? "options"}`
          : undefined;
        return (
          <Card
            key={platform.id}
            title={platform.name}
            subtitle={subtitle}
            count={countFor(platform, sites)}
            logo={logoFor(platform.id) ?? (platform.slug ? logoFor(platform.slug) : null)}
            contain={logoContain(platform.id) || (platform.slug ? logoContain(platform.slug) : false)}
            icon={ICONS[platform.id]}
            onClick={() => onPickPlatform(platform)}
          />
        );
      })}
    </div>
  );
}
