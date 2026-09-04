"use client";

import { Mail } from "lucide-react";
import { MAILBOX_CATALOG, mailLogoFor } from "@/lib/mailboxes";
import type { MailboxRow } from "./MailboxesManager";

function Card({
  title,
  subtitle,
  count,
  logo,
  onClick,
}: {
  title: string;
  subtitle?: string;
  count?: string | number;
  logo?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="carbon-card flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[var(--carbon-bg-hover)]"
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl p-1.5 ${
          logo ? "bg-white" : "bg-[var(--carbon-bg)]"
        }`}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-full w-full object-contain" />
        ) : (
          <Mail className="h-5 w-5 text-[var(--carbon-text-muted)]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--carbon-text)]">{title}</p>
        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] text-[var(--carbon-text-muted)]">{subtitle}</p>
        )}
      </div>
      {count != null && count !== "" && (
        <span className="shrink-0 text-[12px] tabular-nums text-[var(--carbon-text-muted)]">{count}</span>
      )}
    </button>
  );
}

export default function MailGrid({
  mailboxes,
  onPickSlug,
}: {
  mailboxes: MailboxRow[];
  onPickSlug: (slug: string) => void;
}) {
  const bySlug = new Map(mailboxes.map((b) => [b.slug, b]));
  const gmail = MAILBOX_CATALOG.filter((m) => m.kind === "forward");
  const outlook = MAILBOX_CATALOG.find((m) => m.kind === "outlook");
  const catchalls = MAILBOX_CATALOG.filter((m) => m.kind === "catchall");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {gmail.map((box) => (
        <Card
          key={box.slug}
          title={box.name}
          subtitle={box.email}
          count={bySlug.get(box.slug)?.total ?? 0}
          logo={mailLogoFor(box.kind, box.slug)}
          onClick={() => onPickSlug(box.slug)}
        />
      ))}
      {outlook && (
        <Card
          title="Outlook"
          subtitle="Accounts + aliases"
          count={bySlug.get(outlook.slug)?.total ?? 0}
          logo={mailLogoFor("outlook", "outlook")}
          onClick={() => onPickSlug("outlook")}
        />
      )}
      {catchalls.map((box) => (
        <Card
          key={box.slug}
          title={box.name}
          subtitle={box.domain ? `@${box.domain}` : box.email}
          count={bySlug.get(box.slug)?.total ?? 0}
          logo={mailLogoFor(box.kind, box.slug)}
          onClick={() => onPickSlug(box.slug)}
        />
      ))}
    </div>
  );
}
