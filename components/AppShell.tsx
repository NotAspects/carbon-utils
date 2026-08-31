"use client";

import { usePathname } from "next/navigation";
import Layout from "./Layout";

const BARE_PREFIXES = ["/login"];

function isBareRoute(pathname: string) {
  return BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  if (isBareRoute(pathname)) return <>{children}</>;
  return <Layout>{children}</Layout>;
}
