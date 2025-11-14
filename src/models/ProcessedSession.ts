import prisma from "../config/prisma.js";

// Type for ProcessedSession (will be generated after Prisma client regeneration)
type PrismaProcessedSession = {
  id: string;
  sessionId: string;
  userId: string;
  dataConsumed: number;
  averageSessionBandwidth: number;
  sessionDuration: number;
  startedAt: Date;
  endedAt: Date;
  terminationReason: string;
  serverLocation: string | null;
  processedAt: Date;
};

/**
 * ProcessedSession Model - Manages processed session data warehouse records
 */
class ProcessedSession {
  /**
   * Create a processed session record
   */
  async create(data: {
    sessionId: string;
    userId: string;
    dataConsumed: number; // In KB
    averageSessionBandwidth: number; // In KB/sec
    sessionDuration: number; // In minutes
    startedAt: Date;
    endedAt: Date;
    terminationReason: string;
    serverLocation?: string | null;
  }): Promise<PrismaProcessedSession> {
    try {
      const processedSession = await (prisma as any).processedSession.create({
        data: {
          sessionId: data.sessionId,
          userId: data.userId,
          dataConsumed: data.dataConsumed,
          averageSessionBandwidth: data.averageSessionBandwidth,
          sessionDuration: data.sessionDuration,
          startedAt: data.startedAt,
          endedAt: data.endedAt,
          terminationReason: data.terminationReason,
          serverLocation: data.serverLocation || null,
        },
      });

      console.log(
        `✅ Processed session created: ${processedSession.id} for session ${data.sessionId}`
      );
      return processedSession;
    } catch (error) {
      console.error("❌ Failed to create processed session:", error);
      throw error;
    }
  }

  /**
   * Check if a session has already been processed
   */
  async isProcessed(sessionId: string): Promise<boolean> {
    try {
      const processed = await (prisma as any).processedSession.findUnique({
        where: { sessionId },
      });
      return processed !== null;
    } catch (error) {
      console.error("❌ Failed to check if session is processed:", error);
      throw error;
    }
  }

  /**
   * Find processed sessions by user ID
   */
  async findByUserId(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<PrismaProcessedSession[]> {
    try {
      const { limit = 50, offset = 0 } = options;
      return await (prisma as any).processedSession.findMany({
        where: { userId },
        orderBy: { endedAt: "desc" },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      console.error("❌ Failed to find processed sessions:", error);
      throw error;
    }
  }

  /**
   * Get processed sessions by date range
   */
  async findByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<PrismaProcessedSession[]> {
    try {
      return await (prisma as any).processedSession.findMany({
        where: {
          endedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { endedAt: "desc" },
      });
    } catch (error) {
      console.error("❌ Failed to find processed sessions by date range:", error);
      throw error;
    }
  }

  /**
   * Get processed sessions by server location
   */
  async findByServerLocation(
    serverLocation: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<PrismaProcessedSession[]> {
    try {
      const { limit = 50, offset = 0 } = options;
      return await (prisma as any).processedSession.findMany({
        where: { serverLocation },
        orderBy: { endedAt: "desc" },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      console.error(
        "❌ Failed to find processed sessions by server location:",
        error
      );
      throw error;
    }
  }
}

export default ProcessedSession;

