"use client";

import { useMemo } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { MAIL_GROUPS, type MailGroup } from "@/lib/mailboxes";
import type { MailboxRow } from "./MailboxesManager";

function countFor(group: MailGroup, bySlug: Map<string, MailboxRow>) {
  return group.children.reduce((sum, child) => sum + (bySlug.get(child.slug)?.total ?? 0), 0);
}

function Card({
  title,
  subtitle,
  count,
  onClick,
}: {
  title: string;
  subtitle?: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="carbon-card flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[var(--carbon-bg-hover)]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--carbon-bg)]">
        <Mail className="h-5 w-5 text-[var(--carbon-text-muted)]" />
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

export default function MailGrid({
  mailboxes,
  groupId,
  onBack,
  onPickGroup,
  onPickSlug,
}: {
  mailboxes: MailboxRow[];
  groupId: string | null;
  onBack: () => void;
  onPickGroup: (group: MailGroup) => void;
  onPickSlug: (slug: string) => void;
}) {
  const bySlug = useMemo(() => new Map(mailboxes.map((b) => [b.slug, b])), [mailboxes]);
  const group = MAIL_GROUPS.find((g) => g.id === groupId) ?? null;

  if (group) {
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--carbon-text-muted)] hover:text-[var(--carbon-text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All mailboxes
        </button>
        <h2 className="mb-3 text-[15px] font-medium text-[var(--carbon-text)]">{group.name}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {group.children.map((child) => (
            <Card
              key={child.slug}
              title={child.short}
              subtitle={child.name}
              count={bySlug.get(child.slug)?.total ?? 0}
              onClick={() => onPickSlug(child.slug)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {MAIL_GROUPS.map((g) => (
        <Card
          key={g.id}
          title={g.name}
          subtitle={`${g.children.length} ${g.hint?.toLowerCase() ?? "options"}`}
          count={countFor(g, bySlug)}
          onClick={() => onPickGroup(g)}
        />
      ))}
    </div>
  );
}
