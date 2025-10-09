import prisma from '../config/prisma.js';
import type {
  CreateConnectionSessionData,
  UpdateConnectionSessionData,
  ConnectionSessionQueryOptions,
  ConnectionStats
} from '../types/index.js';

// Type alias for ConnectionSession from Prisma (non-nullable version)
type PrismaConnectionSession = NonNullable<Awaited<ReturnType<typeof prisma.connectionSession.findUnique>>>;

// Session type for statistics
interface SessionData {
  durationSeconds: number;
  platform: string;
  bytesTransferred: bigint;
  serverLocation: string | null;
  createdAt: Date;
}

/**
 * ConnectionSession Model - Manages VPN connection session tracking
 * TypeScript + Prisma ORM for full type safety
 */
class ConnectionSession {
  /**
   * Create a new connection session
   */
  async create(sessionData: CreateConnectionSessionData): Promise<PrismaConnectionSession> {
    try {
      const session = await prisma.connectionSession.create({
        data: {
          userId: sessionData.userId,
          sessionStart: sessionData.sessionStart,
          sessionEnd: sessionData.sessionEnd || null,
          durationSeconds: sessionData.durationSeconds,
          serverLocation: sessionData.serverLocation || null,
          serverAddress: sessionData.serverAddress || null,
          platform: sessionData.platform,
          appVersion: sessionData.appVersion || null,
          bytesTransferred: BigInt(sessionData.bytesTransferred || 0),
          subscriptionTier: sessionData.subscriptionTier || 'free',
          isAnonymized: false
        },
        include: {
          user: true
        }
      });

      console.log('✅ Connection session created successfully:', session.id);
      return session;
    } catch (error) {
      console.error('❌ Failed to create connection session:', error);
      throw error;
    }
  }

  /**
   * Find session by ID
   */
  async findById(sessionId: string): Promise<PrismaConnectionSession | null> {
    try {
      return await prisma.connectionSession.findUnique({
        where: { id: sessionId }
      });
    } catch (error) {
      console.error('❌ Failed to find connection session:', error);
      throw error;
    }
  }

  /**
   * Find all sessions for a user
   */
  async findByUserId(
    userId: string,
    options: ConnectionSessionQueryOptions = {}
  ): Promise<PrismaConnectionSession[]> {
    try {
      const {
        limit = 50,
        offset = 0,
        orderBy = 'createdAt',
        ascending = false
      } = options;

      return await prisma.connectionSession.findMany({
        where: { userId },
        orderBy: { [orderBy]: ascending ? 'asc' : 'desc' },
        take: limit,
        skip: offset
      });
    } catch (error) {
      console.error('❌ Failed to find connection sessions:', error);
      throw error;
    }
  }

  /**
   * Get connection statistics for a user
   */
  async getStats(userId: string): Promise<ConnectionStats> {
    try {
      // Get all sessions
      const sessions = await prisma.connectionSession.findMany({
        where: { userId },
        select: {
          durationSeconds: true,
          platform: true,
          bytesTransferred: true,
          serverLocation: true,
          createdAt: true
        }
      });

      // Calculate statistics
      const totalSessions = sessions.length;
      const totalDuration = sessions.reduce((sum: number, s: SessionData) => sum + s.durationSeconds, 0);
      const totalBytes = sessions.reduce((sum: number, s: SessionData) => sum + Number(s.bytesTransferred || 0), 0);
      const averageDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;

      // Group by platform
      const platformStats = sessions.reduce((acc: Record<string, { sessions: number; duration: number; bytes: number }>, session: SessionData) => {
        const platform = session.platform;
        if (!acc[platform]) {
          acc[platform] = { sessions: 0, duration: 0, bytes: 0 };
        }
        acc[platform].sessions += 1;
        acc[platform].duration += session.durationSeconds;
        acc[platform].bytes += Number(session.bytesTransferred || 0);
        return acc;
      }, {} as Record<string, { sessions: number; duration: number; bytes: number }>);

      // Group by server location
      const locationStats = sessions.reduce((acc: Record<string, { sessions: number; duration: number; bytes: number }>, session: SessionData) => {
        const location = session.serverLocation || 'Unknown';
        if (!acc[location]) {
          acc[location] = { sessions: 0, duration: 0, bytes: 0 };
        }
        acc[location].sessions += 1;
        acc[location].duration += session.durationSeconds;
        acc[location].bytes += Number(session.bytesTransferred || 0);
        return acc;
      }, {} as Record<string, { sessions: number; duration: number; bytes: number }>);

      // Get most recent session
      const mostRecentSession = sessions.length > 0
        ? sessions.reduce((latest: SessionData, session: SessionData) =>
          new Date(session.createdAt) > new Date(latest.createdAt) ? session : latest
        )
        : null;

      return {
        total_sessions: totalSessions,
        total_duration_seconds: totalDuration,
        total_bytes_transferred: totalBytes,
        average_duration_seconds: averageDuration,
        platform_breakdown: platformStats,
        location_breakdown: locationStats,
        most_recent_session: mostRecentSession ? {
          date: mostRecentSession.createdAt,
          duration: mostRecentSession.durationSeconds,
          server: mostRecentSession.serverLocation
        } : null
      };
    } catch (error) {
      console.error('❌ Failed to get connection stats:', error);
      throw error;
    }
  }

  /**
   * Update session (e.g., when session ends)
   */
  async update(
    sessionId: string,
    updateData: UpdateConnectionSessionData
  ): Promise<PrismaConnectionSession> {
    try {
      // Prepare data with proper types
      const data: {
        sessionEnd?: Date;
        durationSeconds?: number;
        bytesTransferred?: bigint;
      } = {};
      
      // Copy over fields with proper type handling
      if (updateData.sessionEnd !== undefined) {
        data.sessionEnd = updateData.sessionEnd;
      }
      if (updateData.durationSeconds !== undefined) {
        data.durationSeconds = updateData.durationSeconds;
      }
      if (updateData.bytesTransferred !== undefined) {
        data.bytesTransferred = BigInt(updateData.bytesTransferred);
      }

      const session = await prisma.connectionSession.update({
        where: { id: sessionId },
        data
      });

      console.log('✅ Connection session updated successfully:', session.id);
      return session;
    } catch (error) {
      console.error('❌ Failed to update connection session:', error);
      throw error;
    }
  }

  /**
   * Delete session
   */
  async delete(sessionId: string): Promise<boolean> {
    try {
      await prisma.connectionSession.delete({
        where: { id: sessionId }
      });

      console.log('✅ Connection session deleted successfully:', sessionId);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete connection session:', error);
      throw error;
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteByUserId(userId: string): Promise<boolean> {
    try {
      await prisma.connectionSession.deleteMany({
        where: { userId }
      });

      console.log('✅ Connection sessions deleted successfully for user:', userId);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete connection sessions:', error);
      throw error;
    }
  }

  /**
   * Get session with user info
   */
  async getWithUserInfo(sessionId: string) {
    try {
      return await prisma.connectionSession.findUnique({
        where: { id: sessionId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true
            }
          }
        }
      });
    } catch (error) {
      console.error('❌ Failed to get connection session with user info:', error);
      throw error;
    }
  }

  /**
   * Get recent sessions (last N sessions across all users - for admin)
   */
  async getRecent(limit: number = 10) {
    try {
      return await prisma.connectionSession.findMany({
        orderBy: {
          createdAt: 'desc'
        },
        take: limit,
        include: {
          user: {
            select: {
              email: true,
              displayName: true
            }
          }
        }
      });
    } catch (error) {
      console.error('❌ Failed to get recent sessions:', error);
      throw error;
    }
  }

  /**
   * GDPR Compliance: Anonymize old sessions (remove PII after retention period)
   * Sessions older than the specified days will have user-identifiable data removed
   */
  async anonymizeOldSessions(daysOld: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await prisma.connectionSession.updateMany({
        where: {
          createdAt: { lt: cutoffDate },
          isAnonymized: false
        },
        data: {
          serverAddress: null, // Remove server IP
          isAnonymized: true
        }
      });

      console.log(`✅ Anonymized ${result.count} sessions older than ${daysOld} days`);
      return result.count;
    } catch (error) {
      console.error('❌ Failed to anonymize old sessions:', error);
      throw error;
    }
  }

  /**
   * Delete sessions older than retention period (GDPR compliance)
   */
  async deleteOldSessions(daysOld: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await prisma.connectionSession.deleteMany({
        where: {
          createdAt: { lt: cutoffDate }
        }
      });

      console.log(`✅ Deleted ${result.count} sessions older than ${daysOld} days`);
      return result.count;
    } catch (error) {
      console.error('❌ Failed to delete old sessions:', error);
      throw error;
    }
  }

  /**
   * Aggregate sessions into anonymized analytics (daily aggregation)
   * This creates privacy-preserving analytics that don't link to individual users
   */
  async aggregateSessionsForDate(date: Date): Promise<void> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Get sessions for this day
      const sessions = await prisma.connectionSession.findMany({
        where: {
          sessionStart: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        select: {
          userId: true,
          platform: true,
          serverLocation: true,
          subscriptionTier: true,
          durationSeconds: true,
          bytesTransferred: true
        }
      });

      if (sessions.length === 0) {
        console.log(`No sessions to aggregate for ${date.toISOString().split('T')[0]}`);
        return;
      }

      // Group by platform, location, and tier
      const groups = new Map<string, {
        platform: string;
        serverLocation: string;
        subscriptionTier: string;
        userIds: Set<string>;
        totalSessions: number;
        totalDuration: number;
        totalBytes: bigint;
      }>();

      for (const session of sessions) {
        const key = `${session.platform}|${session.serverLocation || 'unknown'}|${session.subscriptionTier || 'free'}`;
        
        if (!groups.has(key)) {
          groups.set(key, {
            platform: session.platform,
            serverLocation: session.serverLocation || 'unknown',
            subscriptionTier: session.subscriptionTier || 'free',
            userIds: new Set(),
            totalSessions: 0,
            totalDuration: 0,
            totalBytes: BigInt(0)
          });
        }

        const group = groups.get(key)!;
        group.userIds.add(session.userId);
        group.totalSessions += 1;
        group.totalDuration += session.durationSeconds;
        group.totalBytes += session.bytesTransferred;
      }

      // Save aggregates
      for (const [, group] of groups) {
        const avgDuration = Math.round(group.totalDuration / group.totalSessions);
        const avgBytes = group.totalBytes / BigInt(group.totalSessions);

        await prisma.sessionAggregate.upsert({
          where: {
            aggregationDate_platform_serverLocation_subscriptionTier: {
              aggregationDate: startOfDay,
              platform: group.platform,
              serverLocation: group.serverLocation,
              subscriptionTier: group.subscriptionTier
            }
          },
          create: {
            aggregationDate: startOfDay,
            platform: group.platform,
            serverLocation: group.serverLocation,
            subscriptionTier: group.subscriptionTier,
            totalSessions: group.totalSessions,
            totalDuration: group.totalDuration,
            totalBytes: group.totalBytes,
            avgDuration: avgDuration,
            avgBytes: avgBytes,
            uniqueUsers: group.userIds.size
          },
          update: {
            totalSessions: group.totalSessions,
            totalDuration: group.totalDuration,
            totalBytes: group.totalBytes,
            avgDuration: avgDuration,
            avgBytes: avgBytes,
            uniqueUsers: group.userIds.size
          }
        });
      }

      console.log(`✅ Aggregated ${sessions.length} sessions into ${groups.size} aggregates for ${date.toISOString().split('T')[0]}`);
    } catch (error) {
      console.error('❌ Failed to aggregate sessions:', error);
      throw error;
    }
  }
}

export default ConnectionSession;

