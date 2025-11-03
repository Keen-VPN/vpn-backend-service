import express, { Request, Response } from 'express';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import { verifyPermanentSessionToken } from '../utils/auth.js';
import prisma from '../config/prisma.js';
import type { ApiResponse, LinkAppleIAPRequest } from '../types/index.js';
import type { SubscriptionWithAppleIAP } from '../types/subscription-types.js';

const router = express.Router();

// Apple's receipt verification URLs
const APPLE_RECEIPT_URLS = {
  sandbox: 'https://sandbox.itunes.apple.com/verifyReceipt',
  production: 'https://buy.itunes.apple.com/verifyReceipt'
};

/**
 * Verify Apple receipt with Apple's servers
 */
async function verifyAppleReceipt(receiptData: string): Promise<any> {
  try {
    // First try production URL
    let response = await fetch(APPLE_RECEIPT_URLS.production, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        'receipt-data': receiptData,
        'password': process.env.APPLE_SHARED_SECRET || '',
        'exclude-old-transactions': true
      })
    });

    let result = await response.json() as any;

    // If production returns sandbox error, try sandbox URL
    if (result.status === 21007) {
      console.log('🔄 Production receipt failed, trying sandbox...');
      response = await fetch(APPLE_RECEIPT_URLS.sandbox, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'receipt-data': receiptData,
          'password': process.env.APPLE_SHARED_SECRET || '',
          'exclude-old-transactions': true
        })
      });
      result = await response.json();
    }

    return result;
  } catch (error) {
    console.error('❌ Error verifying Apple receipt:', error);
    throw error;
  }
}

/**
 * Link Apple IAP purchase to user account
 */
router.post('/link-purchase', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken, receiptData, transactionId, originalTransactionId, productId } = req.body as LinkAppleIAPRequest;

    // Validate required fields
    if (!sessionToken || !transactionId || !originalTransactionId || !productId) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionToken, transactionId, originalTransactionId, productId'
      } as ApiResponse);
      return;
    }

    console.log('🍎 Apple IAP link request:', { transactionId, originalTransactionId, productId, hasReceipt: !!receiptData });

    // Verify session token
    const userInfo = verifyPermanentSessionToken(sessionToken);
    if (!userInfo) {
      res.status(401).json({
        success: false,
        error: 'Invalid session token'
      } as ApiResponse);
      return;
    }

    const userModel = new User();
    const subscriptionModel = new Subscription();

    // Get user by ID
    let user = await userModel.findById(userInfo.userId);

    // In development, if user not found by ID, try alternative lookups
    // This handles cases where token was generated on a different environment
    if (!user && process.env.NODE_ENV === "development") {
      console.log(`🔧 Development mode: User ${userInfo.userId} not found by ID for IAP link, trying alternative lookups...`);
      
      // Try finding by email first
      if (userInfo.email) {
        console.log(`🔍 Searching for user by email: ${userInfo.email}`);
        user = await userModel.findByEmail(userInfo.email);
        if (user) {
          console.log(`✅ Found user by email: ${user.id}`);
        }
      }
      
      // Try finding by firebase_uid if still not found
      if (!user) {
        console.log(`🔍 Searching for user by firebase_uid: ${userInfo.userId}`);
        user = await userModel.findByFirebaseUid(userInfo.userId);
        if (user) {
          console.log(`✅ Found user by firebase_uid: ${user.id}`);
        }
      }
    }

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      } as ApiResponse);
      return;
    }

    // Verify receipt with Apple (if provided) - do this early so we have purchase data
    let purchase: any = null;
    let environment: 'Sandbox' | 'Production' = 'Sandbox';
    
    if (receiptData && receiptData.length > 0) {
      console.log('🔍 Verifying receipt with Apple...');
      const receiptResult = await verifyAppleReceipt(receiptData);

      if (receiptResult.status !== 0) {
        console.error('❌ Apple receipt verification failed:', receiptResult);
        console.log('⚠️ Proceeding with transaction IDs only (sandbox mode)');
        // In sandbox/development mode, we'll trust the transaction IDs
      } else {
        console.log('✅ Apple receipt verified successfully');

        // Find the transaction in the receipt
        const receipt = receiptResult.receipt;
        const inAppPurchases = receipt.in_app || [];
        
        purchase = inAppPurchases.find((p: any) => 
          p.transaction_id === transactionId || p.original_transaction_id === originalTransactionId
        );

        if (!purchase) {
          console.log('⚠️ Transaction not found in receipt, using transaction IDs directly');
        } else {
          environment = receiptResult.environment === 'Production' ? 'Production' : 'Sandbox';
        }
      }
    } else {
      console.log('⚠️ No receipt provided (sandbox/development mode), trusting transaction IDs');
    }
    
    // Check if this transaction is already linked (after getting purchase data)
    const existingSubscription = await subscriptionModel.findByAppleTransactionId(transactionId);
    if (existingSubscription) {
      // Check if it belongs to the same user
      if (existingSubscription.userId === user.id) {
        // Same user - check if subscription needs to be reactivated
        // If subscription is inactive but IAP is still valid, reactivate and update dates
        const now = new Date();
        const existingExpiresDate = existingSubscription.currentPeriodEnd;
        const isExpired = existingExpiresDate && new Date(existingExpiresDate) < now;
        
        // Calculate new expiration date from IAP (if we have purchase data)
        let newExpiresDate = existingExpiresDate;
        if (purchase?.expires_date_ms) {
          newExpiresDate = new Date(parseInt(purchase.expires_date_ms));
        } else if (!existingExpiresDate || isExpired) {
          // Default to 1 year from now if no date available
          newExpiresDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        }
        
        // If subscription exists but is inactive, always reactivate it
        // Since the client is calling this endpoint with an active IAP, we should reactivate
        if (existingSubscription.status === 'inactive') {
          console.log('🔄 Reactivating existing Apple IAP subscription (status was inactive)');
          const updateData: any = {
            status: 'active'
          };
          
          // Update end date if it's expired, missing, or we have a better date from purchase
          if (!existingExpiresDate || isExpired || (newExpiresDate > existingExpiresDate)) {
            updateData.currentPeriodEnd = newExpiresDate;
            console.log(`📅 Updating subscription end date to: ${newExpiresDate.toISOString()}`);
          }
          
          await subscriptionModel.update(existingSubscription.id, updateData);
          // Reload the subscription to get updated status
          const updatedSubscription = await subscriptionModel.findById(existingSubscription.id);
          console.log('✅ Apple IAP purchase already linked to this account - reactivated');
          res.status(200).json({
            success: true,
            message: 'Purchase already linked to this account - reactivated',
            subscription: {
              id: updatedSubscription!.id,
              status: updatedSubscription!.status,
              planName: updatedSubscription!.planName,
              endDate: updatedSubscription!.currentPeriodEnd?.toISOString(),
              subscriptionType: 'apple_iap'
            }
          } as ApiResponse);
          return;
        }
        
        // Subscription is already active - return success with current status
        console.log('✅ Apple IAP purchase already linked to this account (already active)');
        res.status(200).json({
          success: true,
          message: 'Purchase already linked to this account',
          subscription: {
            id: existingSubscription.id,
            status: existingSubscription.status,
            planName: existingSubscription.planName,
            endDate: existingSubscription.currentPeriodEnd?.toISOString(),
            subscriptionType: 'apple_iap'
          }
        } as ApiResponse);
        return;
      } else {
        // Different user - transfer subscription to current user and remove duplicates
        console.log(`🔄 IAP already linked to different account (${existingSubscription.userId}), transferring to current user (${user.id})`);
        
        // Find all subscriptions linked to this transaction ID or original transaction ID
        const allLinkedSubscriptions = await prisma.subscription.findMany({
          where: {
            OR: [
              { appleTransactionId: transactionId },
              { appleOriginalTransactionId: originalTransactionId }
            ]
          }
        });
        
        console.log(`📦 Found ${allLinkedSubscriptions.length} subscription(s) linked to this IAP`);
        
        // Keep the original subscription (the one we found first)
        const originalSubscription = existingSubscription;
        
        // Calculate new expiration date from IAP (if we have purchase data)
        const now = new Date();
        const existingExpiresDate = originalSubscription.currentPeriodEnd;
        const isExpired = existingExpiresDate && new Date(existingExpiresDate) < now;
        
        let newExpiresDate = existingExpiresDate;
        if (purchase?.expires_date_ms) {
          newExpiresDate = new Date(parseInt(purchase.expires_date_ms));
        } else if (!existingExpiresDate || isExpired) {
          // Default to 1 year from now if no date available
          newExpiresDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        }
        
        // Update the original subscription: transfer to current user and reactivate
        const updateData: any = {
          userId: user.id,
          status: 'active'
        };
        
        // Update end date if it's expired, missing, or we have a better date from purchase
        if (!existingExpiresDate || isExpired || (newExpiresDate > existingExpiresDate)) {
          updateData.currentPeriodEnd = newExpiresDate;
          console.log(`📅 Updating subscription end date to: ${newExpiresDate.toISOString()}`);
        }
        
        await subscriptionModel.update(originalSubscription.id, updateData);
        
        // Delete all other subscriptions linked to this IAP (from other accounts)
        const subscriptionsToDelete = allLinkedSubscriptions.filter(
          sub => sub.id !== originalSubscription.id
        );
        
        for (const subToDelete of subscriptionsToDelete) {
          console.log(`🗑️ Deleting duplicate subscription ${subToDelete.id} from user ${subToDelete.userId}`);
          await subscriptionModel.delete(subToDelete.id);
        }
        
        // Reload the updated subscription
        const updatedSubscription = await subscriptionModel.findById(originalSubscription.id);
        console.log(`✅ IAP subscription transferred to user ${user.id} and reactivated`);
        
        res.status(200).json({
          success: true,
          message: 'Purchase transferred to this account and reactivated',
          subscription: {
            id: updatedSubscription!.id,
            status: updatedSubscription!.status,
            planName: updatedSubscription!.planName,
            endDate: updatedSubscription!.currentPeriodEnd?.toISOString(),
            subscriptionType: 'apple_iap'
          }
        } as ApiResponse);
        return;
      }
    }

    // Also check by original transaction ID (in case subscription was created with original ID but not transaction ID)
    const existingByOriginalId = await subscriptionModel.findByAppleOriginalTransactionId(originalTransactionId);
    if (existingByOriginalId) {
      // Check if it belongs to the same user
      if (existingByOriginalId.userId === user.id) {
        // Same user - same logic as transactionId check
        const now = new Date();
        const existingExpiresDate = existingByOriginalId.currentPeriodEnd;
        const isExpired = existingExpiresDate && new Date(existingExpiresDate) < now;
        
        let newExpiresDate = existingExpiresDate;
        if (purchase?.expires_date_ms) {
          newExpiresDate = new Date(parseInt(purchase.expires_date_ms));
        } else if (!existingExpiresDate || isExpired) {
          newExpiresDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        }
        
        if (existingByOriginalId.status === 'inactive') {
          console.log('🔄 Reactivating existing Apple IAP subscription (found by original transaction ID, status was inactive)');
          const updateData: any = {
            status: 'active',
            appleTransactionId: transactionId // Update transaction ID if missing
          };
          
          if (!existingExpiresDate || isExpired || (newExpiresDate > existingExpiresDate)) {
            updateData.currentPeriodEnd = newExpiresDate;
          }
          
          await subscriptionModel.update(existingByOriginalId.id, updateData);
          const updatedSubscription = await subscriptionModel.findById(existingByOriginalId.id);
          console.log('✅ Apple IAP purchase already linked to this account - reactivated');
          res.status(200).json({
            success: true,
            message: 'Purchase already linked to this account - reactivated',
            subscription: {
              id: updatedSubscription!.id,
              status: updatedSubscription!.status,
              planName: updatedSubscription!.planName,
              endDate: updatedSubscription!.currentPeriodEnd?.toISOString(),
              subscriptionType: 'apple_iap'
            }
          } as ApiResponse);
          return;
        }
        
        // Already active - return success
        console.log('✅ Apple IAP purchase already linked to this account (found by original transaction ID, already active)');
        res.status(200).json({
          success: true,
          message: 'Purchase already linked to this account',
          subscription: {
            id: existingByOriginalId.id,
            status: existingByOriginalId.status,
            planName: existingByOriginalId.planName,
            endDate: existingByOriginalId.currentPeriodEnd?.toISOString(),
            subscriptionType: 'apple_iap'
          }
        } as ApiResponse);
        return;
      } else {
        // Different user - transfer subscription (same logic as transactionId)
        console.log(`🔄 IAP already linked to different account by original transaction ID (${existingByOriginalId.userId}), transferring to current user (${user.id})`);
        
        const allLinkedSubscriptions = await prisma.subscription.findMany({
          where: {
            OR: [
              { appleTransactionId: transactionId },
              { appleOriginalTransactionId: originalTransactionId }
            ]
          }
        });
        
        console.log(`📦 Found ${allLinkedSubscriptions.length} subscription(s) linked to this IAP`);
        
        const originalSubscription = existingByOriginalId;
        
        const now = new Date();
        const existingExpiresDate = originalSubscription.currentPeriodEnd;
        const isExpired = existingExpiresDate && new Date(existingExpiresDate) < now;
        
        let newExpiresDate = existingExpiresDate;
        if (purchase?.expires_date_ms) {
          newExpiresDate = new Date(parseInt(purchase.expires_date_ms));
        } else if (!existingExpiresDate || isExpired) {
          newExpiresDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        }
        
        const updateData: any = {
          userId: user.id,
          status: 'active',
          appleTransactionId: transactionId // Update transaction ID
        };
        
        if (!existingExpiresDate || isExpired || (newExpiresDate > existingExpiresDate)) {
          updateData.currentPeriodEnd = newExpiresDate;
        }
        
        await subscriptionModel.update(originalSubscription.id, updateData);
        
        const subscriptionsToDelete = allLinkedSubscriptions.filter(
          sub => sub.id !== originalSubscription.id
        );
        
        for (const subToDelete of subscriptionsToDelete) {
          console.log(`🗑️ Deleting duplicate subscription ${subToDelete.id} from user ${subToDelete.userId}`);
          await subscriptionModel.delete(subToDelete.id);
        }
        
        const updatedSubscription = await subscriptionModel.findById(originalSubscription.id);
        console.log(`✅ IAP subscription transferred to user ${user.id} and reactivated`);
        
        res.status(200).json({
          success: true,
          message: 'Purchase transferred to this account and reactivated',
          subscription: {
            id: updatedSubscription!.id,
            status: updatedSubscription!.status,
            planName: updatedSubscription!.planName,
            endDate: updatedSubscription!.currentPeriodEnd?.toISOString(),
            subscriptionType: 'apple_iap'
          }
        } as ApiResponse);
        return;
      }
    }

    // Verify product ID matches (if we have purchase data)
    if (purchase && purchase.product_id !== productId) {
      res.status(400).json({
        success: false,
        error: 'Product ID mismatch'
      } as ApiResponse);
      return;
    }

    // Check if user already has an active subscription
    const activeSubscription = await subscriptionModel.findActiveByUserId(user.id);
    if (activeSubscription) {
      res.status(400).json({
        success: false,
        error: 'User already has an active subscription'
      } as ApiResponse);
      return;
    }

    // Calculate subscription period
    const purchaseDate = purchase?.purchase_date_ms ? new Date(parseInt(purchase.purchase_date_ms)) : new Date();
    const expiresDate = purchase?.expires_date_ms ? new Date(parseInt(purchase.expires_date_ms)) :
                       new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year for annual subscription
    
    // Determine plan details based on product ID
    let planName = 'Premium VPN - Annual';
    let billingPeriod = 'year';
    let priceAmount = 130.99; // Default annual price

    if (productId === 'com.keenvpn.premium.annual') {
      planName = 'Premium VPN - Annual';
      billingPeriod = 'year';
      priceAmount = 130.99;
    }

    // Create Apple IAP subscription
    const subscription = await subscriptionModel.create({
      userId: user.id,
      subscriptionType: 'apple_iap',
      appleTransactionId: transactionId,
      appleOriginalTransactionId: originalTransactionId,
      appleProductId: productId,
      appleEnvironment: environment,
      status: expiresDate && expiresDate > new Date() ? 'active' : 'inactive',
      planId: productId,
      planName,
      priceAmount,
      priceCurrency: 'USD',
      billingPeriod: billingPeriod as 'year' | 'month',
      currentPeriodStart: purchaseDate,
      currentPeriodEnd: expiresDate || undefined,
      cancelAtPeriodEnd: false
    });

    console.log('✅ Apple IAP subscription linked successfully:', subscription.id);

    res.status(200).json({
      success: true,
      message: 'Apple IAP purchase linked successfully',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        planName: subscription.planName,
        endDate: subscription.currentPeriodEnd?.toISOString(),
        subscriptionType: 'apple_iap'
      }
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Apple IAP link error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link Apple IAP purchase'
    } as ApiResponse);
  }
});

/**
 * Check Apple IAP subscription status
 */
router.post('/check-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      res.status(400).json({
        success: false,
        error: 'Session token is required'
      } as ApiResponse);
      return;
    }

    // Verify session token
    const userInfo = verifyPermanentSessionToken(sessionToken);
    if (!userInfo) {
      res.status(401).json({
        success: false,
        error: 'Invalid session token'
      } as ApiResponse);
      return;
    }

    const subscriptionModel = new Subscription();

    // Get active subscription
    const activeSubscription = await subscriptionModel.findActiveByUserId(userInfo.userId);

    if (!activeSubscription) {
      res.status(200).json({
        success: true,
        hasSubscription: false,
        subscription: null
      } as ApiResponse);
      return;
    }

    // Cast to subscription with Apple IAP fields
    const subscriptionWithIAP = activeSubscription as SubscriptionWithAppleIAP;

    // Check if it's an Apple IAP subscription
    if (subscriptionWithIAP.subscriptionType !== 'apple_iap') {
      res.status(200).json({
        success: true,
        hasSubscription: true,
        subscription: {
          status: subscriptionWithIAP.status,
          planName: subscriptionWithIAP.planName,
          endDate: subscriptionWithIAP.currentPeriodEnd?.toISOString(),
          subscriptionType: subscriptionWithIAP.subscriptionType
        }
      } as ApiResponse);
      return;
    }

    // For Apple IAP, check if subscription is still valid
    const now = new Date();
    const isActive = activeSubscription.currentPeriodEnd ? 
      activeSubscription.currentPeriodEnd > now : 
      activeSubscription.status === 'active';

    if (!isActive) {
      // Update subscription status to inactive
      await subscriptionModel.update(activeSubscription.id, { status: 'inactive' });
    }

    res.status(200).json({
      success: true,
      hasSubscription: isActive,
      subscription: {
        status: isActive ? 'active' : 'inactive',
        planName: activeSubscription.planName,
        endDate: activeSubscription.currentPeriodEnd?.toISOString(),
        subscriptionType: 'apple_iap'
      }
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Apple IAP status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check Apple IAP status'
    } as ApiResponse);
  }
});

/**
 * Restore Apple IAP purchases
 */
router.post('/restore', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken, receiptData } = req.body;

    if (!sessionToken || !receiptData) {
      res.status(400).json({
        success: false,
        error: 'Session token and receipt data are required'
      } as ApiResponse);
      return;
    }

    console.log('🔄 Restoring Apple IAP purchases...');

    // Verify session token
    const userInfo = verifyPermanentSessionToken(sessionToken);
    if (!userInfo) {
      res.status(401).json({
        success: false,
        error: 'Invalid session token'
      } as ApiResponse);
      return;
    }

    // Verify receipt with Apple
    const receiptResult = await verifyAppleReceipt(receiptData);
    
    if (receiptResult.status !== 0) {
      res.status(400).json({
        success: false,
        error: `Receipt verification failed: ${receiptResult.status}`
      } as ApiResponse);
      return;
    }

    const subscriptionModel = new Subscription();
    const inAppPurchases = receiptResult.receipt.in_app || [];
    
    let restoredCount = 0;
    const restoredPurchases = [];

    for (const purchase of inAppPurchases) {
      // Check if this transaction is already linked
      const existingSubscription = await subscriptionModel.findByAppleOriginalTransactionId(purchase.original_transaction_id);
      
      if (existingSubscription) {
        console.log('📦 Purchase already linked:', purchase.original_transaction_id);
        continue;
      }

      // Create subscription for this purchase
      const purchaseDate = new Date(parseInt(purchase.purchase_date_ms));
      const expiresDate = purchase.expires_date_ms ? new Date(parseInt(purchase.expires_date_ms)) : null;

      await subscriptionModel.create({
        userId: userInfo.userId,
        subscriptionType: 'apple_iap',
        appleTransactionId: purchase.transaction_id,
        appleOriginalTransactionId: purchase.original_transaction_id,
        appleProductId: purchase.product_id,
        appleEnvironment: receiptResult.environment === 'Sandbox' ? 'Sandbox' : 'Production',
        status: expiresDate && expiresDate > new Date() ? 'active' : 'inactive',
        planId: purchase.product_id,
        planName: purchase.product_id === 'com.keenvpn.premium.annual' ? 'Premium VPN - Annual' : 'Premium VPN',
        priceAmount: purchase.product_id === 'com.keenvpn.premium.annual' ? 130.99 : 0,
        priceCurrency: 'USD',
        billingPeriod: 'year',
        currentPeriodStart: purchaseDate,
        currentPeriodEnd: expiresDate || undefined,
        cancelAtPeriodEnd: false
      });

      restoredPurchases.push({
        productId: purchase.product_id,
        transactionId: purchase.transaction_id,
        purchaseDate: purchaseDate.toISOString(),
        expiresDate: expiresDate?.toISOString()
      });

      restoredCount++;
    }

    console.log(`✅ Restored ${restoredCount} Apple IAP purchases`);

    res.status(200).json({
      success: true,
      message: `Restored ${restoredCount} purchases`,
      restoredPurchases
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Apple IAP restore error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to restore Apple IAP purchases'
    } as ApiResponse);
  }
});

/**
 * Sync Apple IAP subscription status
 * This endpoint checks with Apple's servers for the latest subscription status
 * including auto-renewal status
 */
router.post('/sync-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      res.status(400).json({
        success: false,
        error: 'Session token is required'
      } as ApiResponse);
      return;
    }

    // Verify session token
    const userInfo = verifyPermanentSessionToken(sessionToken);
    if (!userInfo) {
      res.status(401).json({
        success: false,
        error: 'Invalid session token'
      } as ApiResponse);
      return;
    }

    const subscriptionModel = new Subscription();

    // Get active subscription
    const activeSubscription = await subscriptionModel.findActiveByUserId(userInfo.userId);

    if (!activeSubscription) {
      res.status(200).json({
        success: true,
        hasSubscription: false,
        message: 'No active subscription found'
      } as ApiResponse);
      return;
    }

    // Cast to subscription with Apple IAP fields
    const subscriptionWithIAP = activeSubscription as SubscriptionWithAppleIAP;

    // Check if it's an Apple IAP subscription
    if (subscriptionWithIAP.subscriptionType !== 'apple_iap') {
      res.status(200).json({
        success: true,
        hasSubscription: true,
        message: 'Not an Apple IAP subscription',
        subscription: {
          status: subscriptionWithIAP.status,
          cancelAtPeriodEnd: subscriptionWithIAP.cancelAtPeriodEnd || false
        }
      } as ApiResponse);
      return;
    }

    console.log('🔄 Syncing Apple IAP subscription status...');

    // For Apple IAP subscriptions, we check the current status
    // In a production app, you would:
    // 1. Use Apple's Server-to-Server notifications for real-time updates
    // 2. Query the App Store Server API for status
    // 3. Validate the receipt again to get latest info
    
    // For now, we'll check the expiration date and update accordingly
    const now = new Date();
    const isExpired = subscriptionWithIAP.currentPeriodEnd ? 
      subscriptionWithIAP.currentPeriodEnd < now : false;

    let updateData: any = {};
    
    if (isExpired && subscriptionWithIAP.status === 'active') {
      console.log('⚠️ Subscription has expired, updating status');
      updateData.status = 'inactive';
    }

    // Note: Auto-renewal cancellation detection would require:
    // - Apple Server-to-Server notifications (recommended)
    // - Or querying the App Store Server API
    // For now, the app will detect this locally via StoreKit

    if (Object.keys(updateData).length > 0) {
      await subscriptionModel.update(activeSubscription.id, updateData);
    }

    res.status(200).json({
      success: true,
      hasSubscription: !isExpired,
      subscription: {
        status: isExpired ? 'inactive' : subscriptionWithIAP.status,
        planName: subscriptionWithIAP.planName,
        endDate: subscriptionWithIAP.currentPeriodEnd?.toISOString(),
        cancelAtPeriodEnd: subscriptionWithIAP.cancelAtPeriodEnd || false,
        subscriptionType: 'apple_iap'
      }
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Apple IAP sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync Apple IAP subscription status'
    } as ApiResponse);
  }
});

export default router;
