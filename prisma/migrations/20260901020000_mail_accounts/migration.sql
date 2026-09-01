-- AlterTable
ALTER TABLE "Mailbox" ADD COLUMN "slug" TEXT;
ALTER TABLE "Mailbox" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';

UPDATE "Mailbox"
SET
  "slug" = CASE
    WHEN "kind" = 'catchall' AND "domain" IS NOT NULL AND "domain" <> ''
      THEN 'catchall-' || replace("domain", '.', '-')
    ELSE lower(replace(split_part("email", '@', 1), '.', '-'))
  END,
  "name" = CASE
    WHEN "name" <> '' THEN "name"
    WHEN "kind" = 'catchall' AND "domain" IS NOT NULL THEN '@' || "domain"
    ELSE split_part("email", '@', 1)
  END
WHERE "slug" IS NULL OR "slug" = '';

UPDATE "Mailbox" m
SET "slug" = m."slug" || '-' || substring(m."id" from 1 for 6)
WHERE m."id" IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY "createdAt") AS rn
    FROM "Mailbox"
  ) t WHERE rn > 1
);

ALTER TABLE "Mailbox" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Mailbox_slug_key" ON "Mailbox"("slug");

-- CreateTable
CREATE TABLE "MailAccount" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "password" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MailAccount_mailboxId_idx" ON "MailAccount"("mailboxId");
CREATE INDEX "MailAccount_status_idx" ON "MailAccount"("status");
CREATE INDEX "MailAccount_login_idx" ON "MailAccount"("login");

ALTER TABLE "MailAccount" ADD CONSTRAINT "MailAccount_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
