import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Ensure environment variables are loaded
dotenv.config();

// Singleton instance of Prisma Client with proper typing
let prisma: PrismaClient;

/**
 * Get Prisma Client instance (singleton pattern)
 * This ensures we only have one Prisma Client instance throughout the app
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
    });

    // Handle cleanup on app termination
    process.on('beforeExit', async () => {
      await prisma.$disconnect();
    });
  }

  return prisma;
}

// Export default instance
export default getPrismaClient();

