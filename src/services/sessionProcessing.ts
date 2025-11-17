import prisma from "../config/prisma.js";
import ConnectionSession from "../models/ConnectionSession.js";
import ProcessedSession from "../models/ProcessedSession.js";

/**
 * Session Processing Service
 * Processes raw connection sessions into structured data warehouse records
 */
class SessionProcessingService {
  private connectionSessionModel: ConnectionSession;
  private processedSessionModel: ProcessedSession;

  constructor() {
    this.connectionSessionModel = new ConnectionSession();
    this.processedSessionModel = new ProcessedSession();
  }

  /**
   * Process a single session
   * Converts raw session data into processed session format with calculated metrics
   */
  async processSession(sessionId: string): Promise<void> {
    try {
      console.log(`🔄 Processing session: ${sessionId}`);

      // Check if already processed
      const isProcessed = await this.processedSessionModel.isProcessed(sessionId);
      if (isProcessed) {
        console.log(`ℹ️ Session ${sessionId} already processed, skipping`);
        return;
      }

      // Get raw session data
      const session = await this.connectionSessionModel.findById(sessionId);
      if (!session) {
        console.error(`❌ Session not found: ${sessionId}`);
        return;
      }

      // Validate session has ended
      if (!session.sessionEnd) {
        console.log(`ℹ️ Session ${sessionId} has not ended yet, skipping`);
        return;
      }

      // Calculate metrics (sessionEnd is guaranteed to be non-null here)
      const metrics = this.calculateMetrics({
        sessionStart: session.sessionStart,
        sessionEnd: session.sessionEnd,
        durationSeconds: session.durationSeconds,
        bytesTransferred: session.bytesTransferred,
      });

      // Create processed session record
      await this.processedSessionModel.create({
        sessionId: session.id,
        userId: session.userId,
        dataConsumed: metrics.dataConsumedKB,
        averageSessionBandwidth: metrics.averageBandwidthKBps,
        sessionDuration: metrics.durationMinutes,
        startedAt: session.sessionStart,
        endedAt: session.sessionEnd,
        terminationReason: session.terminationReason,
        serverLocation: session.serverLocation,
      });

      console.log(`✅ Successfully processed session: ${sessionId}`);
    } catch (error) {
      console.error(`❌ Error processing session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate metrics from raw session data
   */
  private calculateMetrics(session: {
    sessionStart: Date;
    sessionEnd: Date;
    durationSeconds: number;
    bytesTransferred: bigint;
  }): {
    dataConsumedKB: number;
    averageBandwidthKBps: number;
    durationMinutes: number;
  } {
    // Convert bytes to KB (1 KB = 1024 bytes)
    const bytesTransferred = Number(session.bytesTransferred || 0);
    const dataConsumedKB = bytesTransferred / 1024;

    // Calculate duration in minutes
    const durationMinutes = session.durationSeconds / 60;

    // Calculate average bandwidth in KB/sec
    // If duration is 0, default to 0 to avoid division by zero
    const averageBandwidthKBps =
      session.durationSeconds > 0 ? dataConsumedKB / session.durationSeconds : 0;

    return {
      dataConsumedKB: Math.round(dataConsumedKB * 100) / 100, // Round to 2 decimal places
      averageBandwidthKBps: Math.round(averageBandwidthKBps * 100) / 100, // Round to 2 decimal places
      durationMinutes: Math.round(durationMinutes * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Process all unprocessed sessions that have ended
   * @param batchSize - Number of sessions to process per batch (default: 100)
   */
  async processAllUnprocessedSessions(batchSize: number = 100): Promise<{
    processed: number;
    skipped: number;
    errors: number;
  }> {
    const stats = {
      processed: 0,
      skipped: 0,
      errors: 0,
    };

    try {
      console.log(`🔄 Starting batch processing of unprocessed sessions...`);
      console.log(`📊 Batch size: ${batchSize}`);

      // Get all sessions that have ended but haven't been processed
      // We'll process in batches to avoid memory issues
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        console.log(`📦 Processing batch starting at offset ${offset}...`);

        // Get sessions that have ended and haven't been processed
        const sessions = await prisma.connectionSession.findMany({
          where: {
            sessionEnd: { not: null },
          },
          include: {
            // Check if already processed by joining with processed_sessions
            // We'll filter out processed ones in code for better performance
          },
          take: batchSize,
          skip: offset,
          orderBy: { sessionEnd: "asc" }, // Process oldest first
        });

        if (sessions.length === 0) {
          hasMore = false;
          break;
        }

        console.log(`📋 Found ${sessions.length} sessions in this batch`);

        // Process each session
        for (const session of sessions) {
          try {
            // Check if already processed
            const isProcessed =
              await this.processedSessionModel.isProcessed(session.id);

            if (isProcessed) {
              stats.skipped++;
              continue;
            }

            // Process the session
            await this.processSession(session.id);
            stats.processed++;
          } catch (error) {
            console.error(
              `❌ Error processing session ${session.id}:`,
              error
            );
            stats.errors++;
          }
        }

        // Check if we have more sessions to process
        if (sessions.length < batchSize) {
          hasMore = false;
        } else {
          offset += batchSize;
        }
      }

      console.log(`✅ Batch processing completed:`);
      console.log(`   - Processed: ${stats.processed}`);
      console.log(`   - Skipped: ${stats.skipped}`);
      console.log(`   - Errors: ${stats.errors}`);

      return stats;
    } catch (error) {
      console.error("❌ Error in batch processing:", error);
      throw error;
    }
  }

  /**
   * Process sessions that ended in the last 24 hours
   * Useful for incremental processing
   */
  async processRecentSessions(hoursBack: number = 24): Promise<{
    processed: number;
    skipped: number;
    errors: number;
  }> {
    const stats = {
      processed: 0,
      skipped: 0,
      errors: 0,
    };

    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

      console.log(
        `🔄 Processing sessions ended after ${cutoffDate.toISOString()}...`
      );

      // Get sessions that ended in the specified time window
      const sessions = await prisma.connectionSession.findMany({
        where: {
          sessionEnd: {
            not: null,
            gte: cutoffDate,
          },
        },
        orderBy: { sessionEnd: "asc" },
      });

      console.log(`📋 Found ${sessions.length} recent sessions to process`);

      // Process each session
      for (const session of sessions) {
        try {
          // Check if already processed
          const isProcessed =
            await this.processedSessionModel.isProcessed(session.id);

          if (isProcessed) {
            stats.skipped++;
            continue;
          }

          // Process the session
          await this.processSession(session.id);
          stats.processed++;
        } catch (error) {
          console.error(
            `❌ Error processing session ${session.id}:`,
            error
          );
          stats.errors++;
        }
      }

      console.log(`✅ Recent sessions processing completed:`);
      console.log(`   - Processed: ${stats.processed}`);
      console.log(`   - Skipped: ${stats.skipped}`);
      console.log(`   - Errors: ${stats.errors}`);

      return stats;
    } catch (error) {
      console.error("❌ Error processing recent sessions:", error);
      throw error;
    }
  }
}

export default SessionProcessingService;

