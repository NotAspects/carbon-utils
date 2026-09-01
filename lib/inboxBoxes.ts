import { prisma } from "@/lib/prisma";
import { uniqueBoxes, type InboxMailbox } from "@/lib/imapInbox";

export async function loadImapBoxes(mailboxId?: string | null): Promise<InboxMailbox[]> {
  const rows = await prisma.mailbox.findMany({
    where: mailboxId ? { id: mailboxId } : undefined,
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
  return uniqueBoxes(
    rows
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
      }))
  );
}
