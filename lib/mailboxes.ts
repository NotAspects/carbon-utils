export type MailboxKind = "forward" | "catchall" | "outlook";

export type MailboxSeed = {
  slug: string;
  name: string;
  email: string;
  host: string;
  port: number;
  kind: MailboxKind;
  domain?: string;
};

export type MailGroupChild = {
  slug: string;
  name: string;
  short: string;
};

export type MailGroup = {
  id: string;
  name: string;
  hint?: string;
  children: MailGroupChild[];
};

export const MAILBOX_CATALOG: MailboxSeed[] = [
  {
    slug: "forwardcarbon",
    name: "forwardcarbon",
    email: "forwardcarbon@gmail.com",
    host: "imap.gmail.com",
    port: 993,
    kind: "forward",
  },
  {
    slug: "forwardcarbon1",
    name: "forwardcarbon1",
    email: "forwardcarbon1@gmail.com",
    host: "imap.gmail.com",
    port: 993,
    kind: "forward",
  },
  {
    slug: "forwardcarbon2",
    name: "forwardcarbon2",
    email: "forwardcarbon2@gmail.com",
    host: "imap.gmail.com",
    port: 993,
    kind: "forward",
  },
  {
    slug: "forwardcarbon3",
    name: "forwardcarbon3",
    email: "forwardcarbon3@gmail.com",
    host: "imap.gmail.com",
    port: 993,
    kind: "forward",
  },
  {
    slug: "forwardcarbon5",
    name: "forwardcarbon5",
    email: "forwardcarbon5@gmail.com",
    host: "imap.gmail.com",
    port: 993,
    kind: "forward",
  },
  {
    slug: "forwardcarbon6",
    name: "forwardcarbon6",
    email: "forwardcarbon6@gmail.com",
    host: "imap.gmail.com",
    port: 993,
    kind: "forward",
  },
  {
    slug: "otp",
    name: "OTP",
    email: "otp@carbon-automatisation.com",
    host: "imap.gmail.com",
    port: 993,
    kind: "forward",
    domain: "carbon-automatisation.com",
  },
  {
    slug: "catchall-carbon-automatisation",
    name: "@carbon-automatisation.com",
    email: "otp@carbon-automatisation.com",
    host: "imap.gmail.com",
    port: 993,
    kind: "catchall",
    domain: "carbon-automatisation.com",
  },
  {
    slug: "catchall-carbon-ticketing",
    name: "@carbon-ticketing.com",
    email: "forwardcarbon0@gmail.com",
    host: "imap.gmail.com",
    port: 993,
    kind: "catchall",
    domain: "carbon-ticketing.com",
  },
  {
    slug: "outlook",
    name: "Outlook",
    email: "outlook",
    host: "outlook.office365.com",
    port: 993,
    kind: "outlook",
    domain: "outlook.com",
  },
];

export const MAIL_GROUPS: MailGroup[] = [
  {
    id: "icloud-forwards",
    name: "iCloud",
    hint: "Inboxes",
    children: MAILBOX_CATALOG.filter((m) => m.kind === "forward").map((m) => ({
      slug: m.slug,
      name: m.email,
      short: m.name,
    })),
  },
  {
    id: "outlook",
    name: "Outlook",
    hint: "AYCD",
    children: MAILBOX_CATALOG.filter((m) => m.kind === "outlook").map((m) => ({
      slug: m.slug,
      name: m.email,
      short: m.name,
    })),
  },
  {
    id: "catchalls",
    name: "Catchalls",
    hint: "Domains",
    children: MAILBOX_CATALOG.filter((m) => m.kind === "catchall").map((m) => ({
      slug: m.slug,
      name: m.email,
      short: m.name,
    })),
  },
];

export function mailLogoFor(kind: string, slug?: string): string | null {
  if (kind === "forward" || slug?.startsWith("forward") || slug === "otp") return "/logos/icloud.svg";
  if (kind === "outlook" || slug === "outlook") return "/logos/outlook.svg";
  return null;
}

export type MailEntry = {
  login: string;
  password: string | null;
  notes: string | null;
};

export type MailAccountLite = {
  id: string;
  login: string;
  password?: string | null;
  notes?: string | null;
};

export type OutlookGroup = {
  account: MailAccountLite;
  aliases: MailAccountLite[];
};

export function parseMailLines(text: string): string[] {
  return parseMailEntries(text).map((r) => r.login);
}

function notesFromType(value?: string): string | null {
  if (!value) return null;
  if (/^alias$/i.test(value.trim())) return "alias";
  if (/^account$/i.test(value.trim())) return "account";
  return null;
}

export function parseMailEntries(text: string): MailEntry[] {
  const seen = new Set<string>();
  const out: MailEntry[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let emailIdx = 0;
  let passIdx = 1;
  let typeIdx = -1;
  let skippedHeader = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/[,;]/).map((c) => c.trim());
    if (!skippedHeader && cells.some((c) => /^(mail|email|e-mail|login)$/i.test(c))) {
      const lower = cells.map((c) => c.toLowerCase());
      emailIdx = Math.max(0, lower.findIndex((c) => /^(mail|email|e-mail|login)$/.test(c)));
      const p = lower.findIndex((c) => /^(password|pass)$/.test(c));
      passIdx = p >= 0 ? p : 1;
      typeIdx = lower.findIndex((c) => /^(accounttype|type|kind)$/.test(c));
      skippedHeader = true;
      continue;
    }

    let login = "";
    let password: string | null = null;
    let notes: string | null = null;
    if (!skippedHeader && line.includes(":") && !line.startsWith("http")) {
      const i = line.indexOf(":");
      login = line.slice(0, i).trim();
      password = line.slice(i + 1).trim() || null;
    } else {
      login = cells[emailIdx] ?? "";
      password = cells[passIdx] || null;
      notes = notesFromType(typeIdx >= 0 ? cells[typeIdx] : cells[cells.length - 1]);
    }
    if (!login || /^(mail|email|e-mail|login)$/i.test(login)) continue;
    const key = login.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ login, password, notes });
  }
  return out;
}

export function outlookKind(row: MailAccountLite): "account" | "alias" {
  const n = (row.notes ?? "").toLowerCase();
  if (n.includes("alias")) return "alias";
  if (n.includes("account")) return "account";
  if (looksAlias(row.login)) return "alias";
  if (looksPrimary(row.login)) return "account";
  return "account";
}

export function splitOutlookRows(rows: MailAccountLite[]) {
  const groups = groupOutlookAccounts(rows);
  const accounts: MailAccountLite[] = [];
  const aliases: MailAccountLite[] = [];
  for (const g of groups) {
    accounts.push(g.account);
    aliases.push(...g.aliases);
  }
  return { accounts, aliases };
}

function roleOf(row: MailAccountLite): "account" | "alias" | "unknown" {
  const n = (row.notes ?? "").toLowerCase();
  if (n.includes("alias")) return "alias";
  if (n.includes("account")) return "account";
  return "unknown";
}

function looksPrimary(login: string) {
  return /@(hotmail|live|msn)\./i.test(login) || /@outlook\.com$/i.test(login);
}

function looksAlias(login: string) {
  return /@outlook\.(fr|de|es|it|be|nl|at|co\.uk)$/i.test(login);
}

export function groupOutlookAccounts(rows: MailAccountLite[]): OutlookGroup[] {
  const buckets = new Map<string, MailAccountLite[]>();
  for (const row of rows) {
    const key = row.password?.trim() ? `p:${row.password}` : `s:${row.login.toLowerCase()}`;
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }

  const groups: OutlookGroup[] = [];
  for (const members of buckets.values()) {
    const taggedAccount = members.find((m) => roleOf(m) === "account");
    const unknown = members.filter((m) => roleOf(m) === "unknown");
    const primary =
      taggedAccount ??
      unknown.find((m) => looksPrimary(m.login)) ??
      unknown.find((m) => !looksAlias(m.login)) ??
      members[0];
    const aliases = members
      .filter((m) => m.id !== primary.id)
      .sort((a, b) => a.login.localeCompare(b.login));
    groups.push({ account: primary, aliases });
  }

  groups.sort((a, b) => a.account.login.localeCompare(b.account.login));
  return groups;
}
