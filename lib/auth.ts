import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./authOptions";

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user as {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    id?: string;
  };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const ADMIN_IDS = new Set(
  [
    ...(process.env.ADMIN_DISCORD_IDS || "").split(","),
    ...(process.env.NEXT_PUBLIC_ADMIN_DISCORD_IDS || "").split(","),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
);

export function isAdmin(discordId?: string) {
  return Boolean(discordId && ADMIN_IDS.has(discordId));
}

export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user?.id || !isAdmin(user.id)) return null;
  return user;
}
