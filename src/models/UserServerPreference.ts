import prisma from "../config/prisma.js";
import type { CreateUserServerPreferenceData } from "../types/index.js";

// Type alias for UserServerPreference from Prisma (non-nullable version)
type PrismaUserServerPreference = NonNullable<
  Awaited<ReturnType<typeof prisma.userServerPreference.findUnique>>
>;

/**
 * UserServerPreference Model - Manages user preferences for VPN server locations
 * TypeScript + Prisma ORM for full type safety
 */
class UserServerPreference {
  /**
   * Create a new user server preference
   */
  async create(
    userId: string,
    data: CreateUserServerPreferenceData
  ): Promise<PrismaUserServerPreference> {
    try {
      const preference = await prisma.userServerPreference.create({
        data: {
          userId,
          country: data.country.trim(),
          reason: data.reason.trim(),
        },
      });

      console.log("✅ User server preference created:", preference.id);
      return preference;
    } catch (error) {
      console.error("❌ Failed to create user server preference:", error);
      throw error;
    }
  }

  /**
   * Find user server preference by ID
   */
  async findById(id: string): Promise<PrismaUserServerPreference | null> {
    try {
      return await prisma.userServerPreference.findUnique({
        where: { id },
      });
    } catch (error) {
      console.error("❌ Failed to find user server preference by ID:", error);
      throw error;
    }
  }

  /**
   * Find all server preferences for a user
   */
  async findByUserId(userId: string): Promise<PrismaUserServerPreference[]> {
    try {
      return await prisma.userServerPreference.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      console.error("❌ Failed to find user server preferences:", error);
      throw error;
    }
  }

  /**
   * Find a specific preference by user ID and country (to check if it already exists)
   */
  async findByUserIdAndCountry(
    userId: string,
    country: string
  ): Promise<PrismaUserServerPreference | null> {
    try {
      return await prisma.userServerPreference.findUnique({
        where: {
          userId_country: {
            userId,
            country: country.trim(),
          },
        },
      });
    } catch (error) {
      console.error(
        "❌ Failed to find user server preference by user ID and country:",
        error
      );
      throw error;
    }
  }

  /**
   * Update a user server preference
   */
  async update(
    id: string,
    data: Partial<CreateUserServerPreferenceData>
  ): Promise<PrismaUserServerPreference> {
    try {
      const updateData: any = {};
      if (data.country !== undefined) {
        updateData.country = data.country.trim();
      }
      if (data.reason !== undefined) {
        updateData.reason = data.reason.trim();
      }

      const preference = await prisma.userServerPreference.update({
        where: { id },
        data: updateData,
      });

      console.log("✅ User server preference updated:", preference.id);
      return preference;
    } catch (error) {
      console.error("❌ Failed to update user server preference:", error);
      throw error;
    }
  }

  /**
   * Delete a user server preference
   */
  async delete(id: string): Promise<boolean> {
    try {
      await prisma.userServerPreference.delete({
        where: { id },
      });

      console.log("✅ User server preference deleted:", id);
      return true;
    } catch (error) {
      console.error("❌ Failed to delete user server preference:", error);
      throw error;
    }
  }

  /**
   * Get aggregated statistics about server preferences (for analytics)
   */
  async getCountryStatistics(): Promise<
    Array<{ country: string; count: number; latestReason: string | null }>
  > {
    try {
      const stats = await prisma.userServerPreference.groupBy({
        by: ["country"],
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: "desc",
          },
        },
      });

      // Get the latest reason for each country
      const enrichedStats = await Promise.all(
        stats.map(async (stat) => {
          const latestPreference = await prisma.userServerPreference.findFirst({
            where: { country: stat.country },
            orderBy: { createdAt: "desc" },
            select: { reason: true },
          });

          return {
            country: stat.country,
            count: stat._count.id,
            latestReason: latestPreference?.reason || null,
          };
        })
      );

      return enrichedStats;
    } catch (error) {
      console.error("❌ Failed to get country statistics:", error);
      throw error;
    }
  }
}

export default UserServerPreference;
