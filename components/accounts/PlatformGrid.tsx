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
import { useMemo } from "react";
import type { CatalogPlatform } from "@/lib/sites";
import { PLATFORM_CATALOG, logoContain, logoFor, logoInvert, logoZoom } from "@/lib/sites";
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

function countFor(platform: CatalogPlatform, bySlug: Map<string, SiteRow>) {
  const slugs = platform.children?.map((c) => c.slug) ?? (platform.slug ? [platform.slug] : []);
  return slugs.reduce((sum, slug) => sum + (bySlug.get(slug)?.total ?? 0), 0);
}

function Card({
  title,
  subtitle,
  count,
  logo,
  contain,
  invert,
  zoom,
  icon: Icon = Globe,
  onClick,
}: {
  title: string;
  subtitle?: string;
  count: number;
  logo?: string | null;
  contain?: boolean;
  invert?: boolean;
  zoom?: boolean;
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
          contain && !invert ? (zoom ? "bg-white" : "bg-white p-1") : invert ? "bg-[var(--carbon-bg)] p-1.5" : ""
        }`}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            className={`h-full w-full ${contain ? "object-contain" : "object-cover"} ${
              invert ? "brightness-0 invert" : ""
            } ${zoom ? "scale-[1.7]" : ""}`}
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
  const bySlug = useMemo(() => new Map(sites.map((s) => [s.slug, s])), [sites]);
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
              count={bySlug.get(child.slug)?.total ?? 0}
              logo={logoFor(child.slug) ?? logoFor(group.id)}
              contain={logoContain(child.slug) || logoContain(group.id)}
              invert={logoInvert(child.slug) || logoInvert(group.id)}
              zoom={logoZoom(child.slug) || logoZoom(group.id)}
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
            count={countFor(platform, bySlug)}
            logo={logoFor(platform.id) ?? (platform.slug ? logoFor(platform.slug) : null)}
            contain={logoContain(platform.id) || (platform.slug ? logoContain(platform.slug) : false)}
            invert={logoInvert(platform.id) || (platform.slug ? logoInvert(platform.slug) : false)}
            zoom={logoZoom(platform.id) || (platform.slug ? logoZoom(platform.slug) : false)}
            icon={ICONS[platform.id]}
            onClick={() => onPickPlatform(platform)}
          />
        );
      })}
    </div>
  );
}
