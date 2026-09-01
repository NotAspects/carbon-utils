import { PrismaClient } from "@prisma/client";

const CLIENT_REV = 4;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaRev?: number;
};

export const prisma =
  globalForPrisma.prisma && globalForPrisma.prismaRev === CLIENT_REV
    ? globalForPrisma.prisma
    : new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaRev = CLIENT_REV;
}
