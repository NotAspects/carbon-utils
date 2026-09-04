import type { InboxMailbox } from "@/lib/imapInbox";

export const MAIN_BOX_ID = "main";

function envValue(name: string) {
  let value = process.env[name]?.trim() || "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

export function mainImapBox(): InboxMailbox | null {
  const user = envValue("MAIN_IMAP_USER");
  const pass = envValue("MAIN_IMAP_PASSWORD").replace(/\s+/g, "");
  if (!user || !pass) return null;
  return {
    id: MAIN_BOX_ID,
    slug: "main",
    name: "Main",
    email: user,
    user,
    host: envValue("MAIN_IMAP_HOST") || "imap.gmail.com",
    port: Number(envValue("MAIN_IMAP_PORT")) || 993,
    password: pass,
    kind: "forward",
  };
}
