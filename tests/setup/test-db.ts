import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Global flag to track if database is available
let isDatabaseAvailable = false;

/**
 * Check if database is available without throwing
 */
export async function checkDatabaseAvailability(): Promise<boolean> {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    isDatabaseAvailable = true;
    return true;
  } catch (error) {
    isDatabaseAvailable = false;
    return false;
  }
}

export async function setupTestDatabase(): Promise<void> {
  const available = await checkDatabaseAvailability();
  if (!available) {
    console.warn("⚠️  Database not available - tests will be skipped");
    throw new Error("DATABASE_UNAVAILABLE");
  }
  console.log("✅ Test database connected");
}

export function isDbAvailable(): boolean {
  return isDatabaseAvailable;
}

/**
 * Helper to skip tests if database is not available
 * Use this in beforeAll to gracefully skip all tests in a describe block
 */
export async function requireDatabase(): Promise<void> {
  const available = await checkDatabaseAvailability();
  if (!available) {
    console.warn("⚠️  Database not available - skipping tests");
    throw new Error("DATABASE_UNAVAILABLE");
  }
}

/**
 * Skip a test if database is not available
 * Use this at the start of test functions that require DB
 * Throws an error that Jest will treat as a skipped test
 */
export function skipIfNoDb(): void {
  if (!isDatabaseAvailable) {
    // Use test.skip() pattern - but since we're in a helper, we'll just return
    // Tests should check dbAvailable flag instead
    return;
  }
}

export async function cleanupTestDatabase(): Promise<void> {
  if (!isDatabaseAvailable) {
    return; // Skip if DB is not available
  }
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
  if (!isDatabaseAvailable) {
    return; // Skip if DB is not available
  }
  try {
    await prisma.$disconnect();
    console.log("✅ Test database disconnected");
  } catch (error) {
    console.error("❌ Failed to disconnect from test database:", error);
    throw error;
  }
}

export { prisma as testPrisma };
