"use client";

const PAGES: Record<string, { title: string; subtitle: string }> = {
  accounts: {
    title: "Accounts",
    subtitle: "Login accounts by platform — Ticketmaster, Fnac, and whatever you add next.",
  },
};

export default function PageHeader({ page }: { page: keyof typeof PAGES }) {
  const meta = PAGES[page] ?? { title: page, subtitle: "" };

  return (
    <header className="mb-6">
      <h1 className="mb-1 text-xl font-semibold text-white">{meta.title}</h1>
      {meta.subtitle && (
        <p className="text-sm text-[var(--carbon-text-muted)]">{meta.subtitle}</p>
      )}
    </header>
  );
}
