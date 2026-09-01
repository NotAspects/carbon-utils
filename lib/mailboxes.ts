export type MailboxKind = "forward" | "catchall";

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
];

export const MAIL_GROUPS: MailGroup[] = [
  {
    id: "gmail-forwards",
    name: "Gmail forwards",
    hint: "Inboxes",
    children: MAILBOX_CATALOG.filter((m) => m.kind === "forward").map((m) => ({
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

export function parseMailLines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const first = (line.split(/[,;]/)[0] ?? "").split(":")[0].trim();
    if (!first || /^(mail|email|e-mail|login)$/i.test(first)) continue;
    const key = first.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(first);
  }
  return out;
}
