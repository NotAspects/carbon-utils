-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_slug_key" ON "ApiKey"("slug");

-- CreateIndex
CREATE INDEX "ApiKey_group_idx" ON "ApiKey"("group");
