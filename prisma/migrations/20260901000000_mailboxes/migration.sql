-- CreateTable
CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "host" TEXT NOT NULL DEFAULT 'imap.gmail.com',
    "port" INTEGER NOT NULL DEFAULT 993,
    "password" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'forward',
    "domain" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mailbox_kind_idx" ON "Mailbox"("kind");

-- CreateIndex
CREATE INDEX "Mailbox_email_idx" ON "Mailbox"("email");
