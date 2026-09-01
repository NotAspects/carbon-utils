"use client";

import { SessionProvider as NextSessionProvider } from "next-auth/react";

export default function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextSessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      {children}
    </NextSessionProvider>
  );
}
