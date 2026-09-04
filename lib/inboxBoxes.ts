import { AYCD_BOX_ID } from "@/lib/aycdInbox";
import { MAIN_BOX_ID, mainImapBox } from "@/lib/mainInbox";
import { prisma } from "@/lib/prisma";
import { uniqueBoxes, type InboxMailbox } from "@/lib/imapInbox";

export async function resolveImapBox(id: string): Promise<InboxMailbox | null> {
  if (id === MAIN_BOX_ID) return mainImapBox();

  const mailbox = await prisma.mailbox.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      email: true,
      host: true,
      port: true,
      password: true,
      kind: true,
    },
  });
  if (mailbox?.password?.trim() && mailbox.kind !== "outlook") {
    return {
      id: mailbox.id,
      slug: mailbox.slug,
      name: mailbox.name,
      email: mailbox.email,
      host: mailbox.host,
      port: mailbox.port,
      password: mailbox.password,
      kind: mailbox.kind,
    };
  }

  const account = await prisma.mailAccount.findUnique({
    where: { id },
    include: { mailbox: { select: { host: true, port: true, kind: true } } },
  });
  if (!account?.password?.trim()) return null;
  return {
    id: account.id,
    slug: account.mailbox.kind,
    name: account.login,
    email: account.login,
    host: account.mailbox.host || "outlook.office365.com",
    port: account.mailbox.port || 993,
    password: account.password,
    kind: account.mailbox.kind,
  };
}

export async function loadImapBoxes(mailboxId?: string | null): Promise<InboxMailbox[]> {
  if (mailboxId === AYCD_BOX_ID) return [];
  if (mailboxId === MAIN_BOX_ID) {
    const main = mainImapBox();
    return main ? [main] : [];
  }

  if (mailboxId) {
    const box = await resolveImapBox(mailboxId);
    return box ? [box] : [];
  }

  const rows = await prisma.mailbox.findMany({
    where: { kind: { not: "outlook" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      email: true,
      host: true,
      port: true,
      password: true,
      kind: true,
    },
  });
  const main = mainImapBox();
  return uniqueBoxes([
    ...(main ? [main] : []),
    ...rows
      .filter((r) => r.password?.trim())
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        email: r.email,
        host: r.host,
        port: r.port,
        password: r.password!,
        kind: r.kind,
      })),
  ]);
}
