-- CreateTable
CREATE TABLE "ProxyList" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyList_pkey" PRIMARY KEY ("id")
);
