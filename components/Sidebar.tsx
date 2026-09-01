"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Globe, KeyRound, LogOut, Menu, X, ChevronLeft, Mail, Users } from "lucide-react";
import { useState, useEffect } from "react";

const COLLAPSE_KEY = "carbon-utils-sidebar-collapsed";

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "vault";
};

const NAV: NavItem[] = [
  { name: "Accounts", href: "/accounts", icon: Users, group: "vault" },
  { name: "Mails", href: "/mails", icon: Mail, group: "vault" },
  { name: "ISP", href: "/isp", icon: Globe, group: "vault" },
  { name: "API keys", href: "/keys", icon: KeyRound, group: "vault" },
];

const GROUPS: { id: NavItem["group"]; label: string }[] = [{ id: "vault", label: "Vault" }];

function linkActive(pathname: string, href: string) {
  if (href === "/accounts") return pathname === "/" || pathname === "/accounts" || pathname.startsWith("/accounts/");
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const sidebarContent = (opts?: { forceExpanded?: boolean }) => {
    const compact = opts?.forceExpanded ? false : collapsed;

    const itemClass = (active: boolean) =>
      `group flex items-center gap-2.5 rounded-lg text-[12.5px] font-medium ${
        compact ? "justify-center px-2 py-2" : "px-2.5 py-2"
      } ${
        active
          ? "border border-[var(--carbon-border)] bg-[var(--carbon-bg-elevated)] text-[var(--carbon-text)]"
          : "border border-transparent text-[var(--carbon-text-secondary)] hover:bg-[var(--carbon-bg-hover)] hover:text-[var(--carbon-text)]"
      }`;

    const label = (text: string) =>
      compact ? null : (
        <p className="mb-1.5 px-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--carbon-text-muted)]">
          {text}
        </p>
      );

    return (
      <>
        <div
          className={`flex shrink-0 items-center border-b border-[var(--carbon-border)] ${
            compact ? "justify-center px-2 py-3" : "justify-between gap-1.5 px-3 py-3"
          }`}
        >
          <Link href="/accounts" className={`flex min-w-0 items-center ${compact ? "" : "gap-2"}`}>
            <Image
              src="/logo.png"
              alt="Carbon Utils"
              width={compact ? 28 : 26}
              height={compact ? 28 : 26}
              className="rounded-lg flex-shrink-0"
            />
            {!compact && (
              <span className="truncate text-[12.5px] font-semibold leading-tight tracking-tight text-[var(--carbon-text)]">
                Utils
              </span>
            )}
          </Link>
          {!opts?.forceExpanded && !compact && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--carbon-border)] text-[var(--carbon-text-muted)] transition-colors hover:bg-[var(--carbon-bg-hover)] hover:text-[var(--carbon-text)]"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <nav className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-3 ${compact ? "px-1.5" : "px-2"}`}>
          {GROUPS.map((group) => {
            const items = NAV.filter((n) => n.group === group.id);
            if (items.length === 0) return null;
            return (
              <div key={group.id} className="mb-4">
                {label(group.label)}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={itemClass(linkActive(pathname, item.href))}
                      title={compact ? item.name : undefined}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0 opacity-90" />
                      {!compact && <span className="truncate">{item.name}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}

          {!opts?.forceExpanded && compact && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--carbon-border)] text-[var(--carbon-text-muted)] transition-colors hover:bg-[var(--carbon-bg-hover)] hover:text-[var(--carbon-text)]"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
            </button>
          )}
        </nav>

        <div className={`shrink-0 border-t border-[var(--carbon-border)] ${compact ? "p-1.5" : "p-2"}`}>
          {session?.user && (
            <div
              className={`flex items-center rounded-lg border border-[var(--carbon-border)] bg-[var(--carbon-bg-elevated)] ${
                compact ? "justify-center p-1.5" : "gap-2 px-2 py-1.5"
              }`}
            >
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt="Avatar"
                  width={30}
                  height={30}
                  className="rounded-full flex-shrink-0"
                />
              ) : (
                <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--carbon-border)] bg-[var(--carbon-bg)] flex-shrink-0">
                  <span className="text-[11px] font-semibold text-[var(--carbon-text-secondary)]">
                    {session.user.name?.charAt(0)?.toUpperCase() || "?"}
                  </span>
                </div>
              )}
              {!compact && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[13px] font-medium text-[var(--carbon-text)]">
                      {session.user.name}
                    </p>
                    <p className="truncate text-[11px] text-[var(--carbon-text-muted)]">
                      {session.user.email}
                    </p>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="rounded-lg p-1.5 text-[var(--carbon-text-muted)] transition-colors hover:bg-[var(--carbon-bg-hover)] hover:text-white flex-shrink-0"
                    title="Sign out"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-[var(--carbon-border)] bg-[var(--carbon-sidebar)] px-4">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Carbon Utils" width={24} height={24} className="rounded-md" />
          <span className="text-[13px] font-semibold text-[var(--carbon-text)]">Utils</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-1.5 text-[var(--carbon-text-secondary)] transition-colors hover:bg-[var(--carbon-bg-hover)] hover:text-white"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`lg:hidden fixed top-0 left-0 z-50 h-screen w-[220px] flex flex-col border-r border-[var(--carbon-border)] bg-[var(--carbon-sidebar)] transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent({ forceExpanded: true })}
      </aside>

      <aside
        className={`relative hidden lg:flex h-screen min-h-0 flex-col overflow-hidden border-r border-[var(--carbon-border)] bg-[var(--carbon-sidebar)] flex-shrink-0 ${
          collapsed ? "w-[68px]" : "w-[200px]"
        }`}
      >
        {sidebarContent()}
      </aside>
    </>
  );
}
