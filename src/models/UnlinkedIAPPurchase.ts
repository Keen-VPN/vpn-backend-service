import prisma from '../config/prisma.js';
import type { UnlinkedIAPPurchase as PrismaUnlinkedIAPPurchase } from '@prisma/client';

export interface CreateUnlinkedIAPPurchaseData {
  appleTransactionId: string;
  appleOriginalTransactionId: string;
  appleProductId: string;
  appleEnvironment: 'Sandbox' | 'Production';
  purchaseDate: Date;
  expiresDate?: Date | null;
}

export interface UpdateUnlinkedIAPPurchaseData {
  isLinked?: boolean;
  linkedAt?: Date | null;
  linkedUserId?: string | null;
}

/**
 * UnlinkedIAPPurchase Model - Manages IAP purchases before account linking
 * Stores purchase information immediately when user subscribes, even if not logged in
 */
class UnlinkedIAPPurchase {
  /**
   * Create a new unlinked IAP purchase
   */
  async create(purchaseData: CreateUnlinkedIAPPurchaseData): Promise<PrismaUnlinkedIAPPurchase> {
    try {
      const purchase = await prisma.unlinkedIAPPurchase.create({
        data: {
          appleTransactionId: purchaseData.appleTransactionId,
          appleOriginalTransactionId: purchaseData.appleOriginalTransactionId,
          appleProductId: purchaseData.appleProductId,
          appleEnvironment: purchaseData.appleEnvironment,
          purchaseDate: purchaseData.purchaseDate,
          expiresDate: purchaseData.expiresDate || null,
          isLinked: false
        }
      });

      console.log('✅ Unlinked IAP purchase created successfully:', purchase.id);
      return purchase;
    } catch (error) {
      console.error('❌ Failed to create unlinked IAP purchase:', error);
      throw error;
    }
  }

  /**
   * Find unlinked purchase by transaction ID
   */
  async findByTransactionId(transactionId: string): Promise<PrismaUnlinkedIAPPurchase | null> {
    try {
      return await prisma.unlinkedIAPPurchase.findUnique({
        where: { appleTransactionId: transactionId }
      });
    } catch (error) {
      console.error('❌ Failed to find unlinked purchase by transaction ID:', error);
      throw error;
    }
  }

  /**
   * Find unlinked purchase by original transaction ID
   */
  async findByOriginalTransactionId(originalTransactionId: string): Promise<PrismaUnlinkedIAPPurchase | null> {
    try {
      return await prisma.unlinkedIAPPurchase.findFirst({
        where: { 
          appleOriginalTransactionId: originalTransactionId,
          isLinked: false
        }
      });
    } catch (error) {
      console.error('❌ Failed to find unlinked purchase by original transaction ID:', error);
      throw error;
    }
  }

  /**
   * Find all unlinked purchases by original transaction ID (for finding latest)
   */
  async findAllByOriginalTransactionId(originalTransactionId: string): Promise<PrismaUnlinkedIAPPurchase[]> {
    try {
      return await prisma.unlinkedIAPPurchase.findMany({
        where: { 
          appleOriginalTransactionId: originalTransactionId,
          isLinked: false
        },
        orderBy: {
          purchaseDate: 'desc' // Latest first
        }
      });
    } catch (error) {
      console.error('❌ Failed to find unlinked purchases by original transaction ID:', error);
      throw error;
    }
  }

  /**
   * Update unlinked purchase (e.g., mark as linked)
   */
  async update(
    purchaseId: string, 
    updateData: UpdateUnlinkedIAPPurchaseData
  ): Promise<PrismaUnlinkedIAPPurchase> {
    try {
      const purchase = await prisma.unlinkedIAPPurchase.update({
        where: { id: purchaseId },
        data: updateData
      });

      console.log('✅ Unlinked IAP purchase updated successfully:', purchase.id);
      return purchase;
    } catch (error) {
      console.error('❌ Failed to update unlinked IAP purchase:', error);
      throw error;
    }
  }

  /**
   * Mark purchase as linked
   */
  async markAsLinked(
    transactionId: string,
    userId: string
  ): Promise<PrismaUnlinkedIAPPurchase | null> {
    try {
      const purchase = await this.findByTransactionId(transactionId);
      if (!purchase) {
        return null;
      }

      return await this.update(purchase.id, {
        isLinked: true,
        linkedAt: new Date(),
        linkedUserId: userId
      });
    } catch (error) {
      console.error('❌ Failed to mark purchase as linked:', error);
      throw error;
    }
  }

  /**
   * Create or update unlinked purchase (upsert)
   * Useful when the same purchase might be captured multiple times
   */
  async upsert(purchaseData: CreateUnlinkedIAPPurchaseData): Promise<PrismaUnlinkedIAPPurchase> {
    try {
      const purchase = await prisma.unlinkedIAPPurchase.upsert({
        where: { appleTransactionId: purchaseData.appleTransactionId },
        update: {
          // Only update if not already linked
          purchaseDate: purchaseData.purchaseDate,
          expiresDate: purchaseData.expiresDate || null,
          appleEnvironment: purchaseData.appleEnvironment,
          appleProductId: purchaseData.appleProductId,
          appleOriginalTransactionId: purchaseData.appleOriginalTransactionId
        },
        create: {
          appleTransactionId: purchaseData.appleTransactionId,
          appleOriginalTransactionId: purchaseData.appleOriginalTransactionId,
          appleProductId: purchaseData.appleProductId,
          appleEnvironment: purchaseData.appleEnvironment,
          purchaseDate: purchaseData.purchaseDate,
          expiresDate: purchaseData.expiresDate || null,
          isLinked: false
        }
      });

      console.log('✅ Unlinked IAP purchase upserted successfully:', purchase.id);
      return purchase;
    } catch (error) {
      console.error('❌ Failed to upsert unlinked IAP purchase:', error);
      throw error;
    }
  }
}

export default UnlinkedIAPPurchase;

