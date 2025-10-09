import prisma from '../config/prisma.js';
import type { CreateUserData, UpdateUserData, DeleteAccountResult } from '../types/index.js';

// Type alias for User from Prisma (non-nullable version)
type PrismaUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

/**
 * User Model - Manages user data and authentication
 * TypeScript + Prisma ORM for full type safety
 */
class User {
  /**
   * Create a new user
   */
  async create(userData: CreateUserData): Promise<PrismaUser> {
    try {
      const user = await prisma.user.create({
        data: {
          firebaseUid: userData.firebaseUid,
          appleUserId: userData.appleUserId,
          googleUserId: userData.googleUserId,
          email: userData.email,
          displayName: userData.displayName,
          provider: userData.provider || 'google',
          emailVerified: userData.emailVerified || false
        }
      });

      console.log('✅ User created successfully:', user.id);
      return user;
    } catch (error) {
      console.error('❌ Failed to create user:', error);
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<PrismaUser | null> {
    try {
      return await prisma.user.findUnique({
        where: { id: userId }
      });
    } catch (error) {
      console.error('❌ Failed to find user by ID:', error);
      throw error;
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<PrismaUser | null> {
    try {
      console.log('🔍 Searching for user by email:', email);
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (user) {
        console.log('✅ Found user by email:', user.id);
      } else {
        console.log('🔍 No user found by email:', email);
      }

      return user;
    } catch (error) {
      console.error('❌ Failed to find user by email:', error);
      throw error;
    }
  }

  /**
   * Find user by Firebase UID
   */
  async findByFirebaseUid(firebaseUid: string): Promise<PrismaUser | null> {
    try {
      console.log('🔍 Searching for user by Firebase UID:', firebaseUid);
      const user = await prisma.user.findUnique({
        where: { firebaseUid }
      });

      if (user) {
        console.log('✅ Found user by Firebase UID:', user.id);
      } else {
        console.log('🔍 No user found by Firebase UID:', firebaseUid);
      }

      return user;
    } catch (error) {
      console.error('❌ Failed to find user by Firebase UID:', error);
      throw error;
    }
  }

  /**
   * Find user by Apple User ID
   */
  async findByAppleUserId(appleUserId: string): Promise<PrismaUser | null> {
    try {
      console.log('🔍 Searching for user by Apple User ID:', appleUserId);
      const user = await prisma.user.findUnique({
        where: { appleUserId }
      });

      if (user) {
        console.log('✅ Found user by Apple User ID:', user.id);
      }

      return user;
    } catch (error) {
      console.error('❌ Failed to find user by Apple User ID:', error);
      throw error;
    }
  }

  /**
   * Find user by Google User ID
   */
  async findByGoogleUserId(googleUserId: string): Promise<PrismaUser | null> {
    try {
      return await prisma.user.findUnique({
        where: { googleUserId }
      });
    } catch (error) {
      console.error('❌ Failed to find user by Google User ID:', error);
      throw error;
    }
  }

  /**
   * Update user
   */
  async update(userId: string, updateData: UpdateUserData): Promise<PrismaUser> {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: updateData
      });

      console.log('✅ User updated successfully:', user.id);
      return user;
    } catch (error) {
      console.error('❌ Failed to update user:', error);
      throw error;
    }
  }

  /**
   * Get user with their active subscription (backward compatibility)
   */
  async getUserWithSubscription(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscriptions: {
            where: {
              status: 'active',
              OR: [
                { currentPeriodEnd: null },
                { currentPeriodEnd: { gte: new Date() } }
              ]
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 1
          }
        }
      });

      if (!user) return null;

      // Transform to match old API (for backward compatibility)
      const activeSubscription = user.subscriptions[0];
      return {
        ...user,
        // Map to old field names
        firebase_uid: user.firebaseUid,
        display_name: user.displayName,
        email_verified: user.emailVerified,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
        // Subscription fields
        stripe_customer_id: activeSubscription?.stripeCustomerId,
        subscription_status: activeSubscription?.status || 'inactive',
        subscription_plan: activeSubscription?.planName,
        subscription_end_date: activeSubscription?.currentPeriodEnd
      };
    } catch (error) {
      console.error('❌ Failed to get user with subscription:', error);
      throw error;
    }
  }

  /**
   * Delete user
   */
  async delete(userId: string): Promise<boolean> {
    try {
      await prisma.user.delete({
        where: { id: userId }
      });

      console.log('✅ User deleted successfully:', userId);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete user:', error);
      throw error;
    }
  }

  /**
   * Complete account deletion (removes user and all associated data)
   */
  async deleteAccount(userId: string): Promise<DeleteAccountResult> {
    try {
      // Get user first to return info
      const user = await this.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      console.log(`🗑️ Starting account deletion for user ${userId} (${user.email})`);

      // Get subscription info before deletion (for Stripe cleanup)
      const subscriptions = await prisma.subscription.findMany({
        where: { userId },
        select: { stripeCustomerId: true, stripeSubscriptionId: true }
      });

      // Prisma will cascade delete subscriptions and connection sessions
      await prisma.user.delete({
        where: { id: userId }
      });

      console.log(`✅ Account deleted successfully for user ${userId} (${user.email})`);

      return {
        success: true,
        deletedUserId: userId,
        deletedEmail: user.email,
        stripeCustomerIds: subscriptions
          .map((s: { stripeCustomerId: string | null }) => s.stripeCustomerId)
          .filter((id: string | null): id is string => id !== null)
      };
    } catch (error) {
      console.error('❌ Failed to delete account:', error);
      throw error;
    }
  }

  // Backward compatibility aliases
  async createUser(userData: CreateUserData): Promise<PrismaUser> {
    return this.create(userData);
  }

  async updateUser(userId: string, updateData: UpdateUserData): Promise<PrismaUser> {
    return this.update(userId, updateData);
  }

  async deleteUser(userId: string): Promise<boolean> {
    return this.delete(userId);
  }
}

export default User;

