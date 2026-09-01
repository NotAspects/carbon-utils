-- CreateIndex
CREATE INDEX "Account_siteId_status_idx" ON "Account"("siteId", "status");

-- DropIndex
DROP INDEX "Account_siteId_idx";
