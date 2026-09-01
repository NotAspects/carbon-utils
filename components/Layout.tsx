"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "./Sidebar";
import { prefetchVault } from "@/lib/vaultCache";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (status === "authenticated") prefetchVault();
  }, [status, router]);

  if (status === "loading" || status !== "authenticated") {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--carbon-bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--carbon-border)] border-t-[var(--carbon-primary)]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--carbon-bg)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">{children}</main>
    </div>
  );
}
