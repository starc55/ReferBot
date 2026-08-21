import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

type PrismaGlobal = typeof globalThis & {
  __telegramReferralPrisma?: PrismaClient;
};

const prismaGlobal = globalThis as PrismaGlobal;

export function getPrismaClient(): PrismaClient {
  const existingClient = prismaGlobal.__telegramReferralPrisma;
  if (existingClient) {
    return existingClient;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create the Prisma client");
  }

  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    prismaGlobal.__telegramReferralPrisma = client;
  }

  return client;
}

export async function disconnectDatabase(): Promise<void> {
  const client = prismaGlobal.__telegramReferralPrisma;
  if (!client) {
    return;
  }

  await client.$disconnect();
  delete prismaGlobal.__telegramReferralPrisma;
}
