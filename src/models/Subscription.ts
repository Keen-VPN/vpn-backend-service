import prisma from '../config/prisma.js';
import type { Subscription as PrismaSubscription } from '@prisma/client';
import type { CreateSubscriptionData, UpdateSubscriptionData } from '../types/index.js';

/**
 * Subscription Model - Manages user subscriptions
 * TypeScript + Prisma ORM for full type safety
 */
class Subscription {
  /**
   * Create a new subscription
   */
  async create(subscriptionData: CreateSubscriptionData): Promise<PrismaSubscription> {
    try {
      const subscription = await prisma.subscription.create({
        data: {
          userId: subscriptionData.userId,
          stripeCustomerId: subscriptionData.stripeCustomerId,
          stripeSubscriptionId: subscriptionData.stripeSubscriptionId,
          status: subscriptionData.status || 'active',
          planId: subscriptionData.planId,
          planName: subscriptionData.planName,
          priceAmount: subscriptionData.priceAmount,
          priceCurrency: subscriptionData.priceCurrency || 'USD',
          billingPeriod: subscriptionData.billingPeriod,
          currentPeriodStart: subscriptionData.currentPeriodStart,
          currentPeriodEnd: subscriptionData.currentPeriodEnd,
          cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd || false
        },
        include: {
          user: true
        }
      });

      console.log('✅ Subscription created successfully:', subscription.id);
      return subscription;
    } catch (error) {
      console.error('❌ Failed to create subscription:', error);
      throw error;
    }
  }

  /**
   * Find subscription by ID
   */
  async findById(subscriptionId: string): Promise<PrismaSubscription | null> {
    try {
      return await prisma.subscription.findUnique({
        where: { id: subscriptionId }
      });
    } catch (error) {
      console.error('❌ Failed to find subscription by ID:', error);
      throw error;
    }
  }

  /**
   * Find subscription by Stripe subscription ID
   */
  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<PrismaSubscription | null> {
    try {
      return await prisma.subscription.findUnique({
        where: { stripeSubscriptionId }
      });
    } catch (error) {
      console.error('❌ Failed to find subscription by Stripe ID:', error);
      throw error;
    }
  }

  /**
   * Find active subscription for a user
   */
  async findActiveByUserId(userId: string): Promise<PrismaSubscription | null> {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: 'active',
          OR: [
            { currentPeriodEnd: null },
            { currentPeriodEnd: { gte: new Date() } }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (subscription?.currentPeriodEnd) {
        const endDate = new Date(subscription.currentPeriodEnd);
        const now = new Date();
        if (endDate < now) {
          console.log('⚠️ Subscription expired, returning null');
          return null;
        }
      }

      return subscription;
    } catch (error) {
      console.error('❌ Failed to find active subscription:', error);
      throw error;
    }
  }

  /**
   * Find all subscriptions for a user
   */
  async findAllByUserId(userId: string): Promise<PrismaSubscription[]> {
    try {
      return await prisma.subscription.findMany({
        where: { userId },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error) {
      console.error('❌ Failed to find subscriptions:', error);
      throw error;
    }
  }

  /**
   * Update subscription
   */
  async update(subscriptionId: string, updateData: UpdateSubscriptionData): Promise<PrismaSubscription> {
    try {
      const subscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: updateData
      });

      console.log('✅ Subscription updated successfully:', subscription.id);
      return subscription;
    } catch (error) {
      console.error('❌ Failed to update subscription:', error);
      throw error;
    }
  }

  /**
   * Update subscription by Stripe subscription ID
   */
  async updateByStripeId(
    stripeSubscriptionId: string,
    updateData: UpdateSubscriptionData
  ): Promise<PrismaSubscription> {
    try {
      const subscription = await prisma.subscription.update({
        where: { stripeSubscriptionId },
        data: updateData
      });

      console.log('✅ Subscription updated successfully:', subscription.id);
      return subscription;
    } catch (error) {
      console.error('❌ Failed to update subscription by Stripe ID:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription (mark for cancellation at period end)
   */
  async cancel(subscriptionId: string): Promise<PrismaSubscription> {
    try {
      const subscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          cancelAtPeriodEnd: true,
          cancelledAt: new Date(),
          status: 'cancelled'
        }
      });

      console.log('✅ Subscription cancelled successfully:', subscription.id);
      return subscription;
    } catch (error) {
      console.error('❌ Failed to cancel subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription by user ID
   */
  async cancelByUserId(userId: string): Promise<PrismaSubscription> {
    try {
      const activeSubscription = await this.findActiveByUserId(userId);

      if (!activeSubscription) {
        throw new Error('No active subscription found');
      }

      return await this.cancel(activeSubscription.id);
    } catch (error) {
      console.error('❌ Failed to cancel subscription by user ID:', error);
      throw error;
    }
  }

  /**
   * Reactivate a cancelled subscription
   */
  async reactivate(subscriptionId: string): Promise<PrismaSubscription> {
    try {
      const subscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          status: 'active'
        }
      });

      console.log('✅ Subscription reactivated successfully:', subscription.id);
      return subscription;
    } catch (error) {
      console.error('❌ Failed to reactivate subscription:', error);
      throw error;
    }
  }

  /**
   * Delete subscription (hard delete)
   */
  async delete(subscriptionId: string): Promise<boolean> {
    try {
      await prisma.subscription.delete({
        where: { id: subscriptionId }
      });

      console.log('✅ Subscription deleted successfully:', subscriptionId);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete subscription:', error);
      throw error;
    }
  }

  /**
   * Check if user has active subscription
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    try {
      const activeSubscription = await this.findActiveByUserId(userId);
      return activeSubscription !== null;
    } catch (error) {
      console.error('❌ Failed to check active subscription:', error);
      return false;
    }
  }

  /**
   * Get subscription with user info
   */
  async getWithUserInfo(subscriptionId: string) {
    try {
      return await prisma.subscription.findUnique({
        where: { id: subscriptionId },
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
      console.error('❌ Failed to get subscription with user info:', error);
      throw error;
    }
  }
}

export default Subscription;

