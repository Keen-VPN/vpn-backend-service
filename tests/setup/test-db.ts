import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function setupTestDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("✅ Test database connected");
  } catch (error) {
    console.error("❌ Failed to connect to test database:", error);
    throw error;
  }
}

export async function cleanupTestDatabase(): Promise<void> {
  try {
    await prisma.connectionSession.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.user.deleteMany();
    console.log("✅ Test database cleaned");
  } catch (error) {
    console.error("❌ Failed to clean test database:", error);
    throw error;
  }
}

export async function teardownTestDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log("✅ Test database disconnected");
  } catch (error) {
    console.error("❌ Failed to disconnect from test database:", error);
    throw error;
  }
}

export { prisma as testPrisma };
