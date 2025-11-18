import express, { Request, Response } from 'express';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import { verifyPermanentSessionToken } from '../utils/auth.js';
import type {
  ApiResponse,
  CaptureAppleIAPRequest,
  CaptureAppleIAPResponse,
  LinkAppleIAPRequest,
  LinkAppleIAPResponseBody,
  UpdateSubscriptionData,
} from '../types/index.js';
import type { SubscriptionWithAppleIAP } from '../types/subscription-types.js';
import AppleIAPPurchaseModel from '../models/AppleIAPPurchase.js';
import TrialService from '../services/TrialService.js';

const router = express.Router();
const trialService = new TrialService();

// Apple's receipt verification URLs
const APPLE_RECEIPT_URLS = {
  sandbox: 'https://sandbox.itunes.apple.com/verifyReceipt',
  production: 'https://buy.itunes.apple.com/verifyReceipt'
};

const appleIAPPurchaseModel = new AppleIAPPurchaseModel();

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
 * Capture Apple IAP purchase immediately after App Store confirmation.
 * Allows recording purchase metadata before a user account is linked.
 */
router.post(
  '/capture-purchase',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        transactionId,
        originalTransactionId,
        productId,
        purchaseDateMs,
        expiresDateMs,
        receiptData,
        environment,
      } = req.body as CaptureAppleIAPRequest;

      if (!transactionId || !originalTransactionId || !productId || !purchaseDateMs) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          errorCode: 'iap_missing_fields',
        });
        return;
      }

      const purchaseDateInt = Number.parseInt(purchaseDateMs, 10);
      if (Number.isNaN(purchaseDateInt)) {
        res.status(400).json({
          success: false,
          error: 'Invalid purchaseDateMs value',
          errorCode: 'iap_missing_fields',
        });
        return;
      }

      let expiresDate: Date | null = null;
      if (expiresDateMs) {
        const expiresDateInt = Number.parseInt(expiresDateMs, 10);
        if (!Number.isNaN(expiresDateInt)) {
          expiresDate = new Date(expiresDateInt);
        }
      }

      let normalizedEnvironment: "Sandbox" | "Production" | null = null;
      if (environment === 'Sandbox' || environment === 'Production') {
        normalizedEnvironment = environment;
      }

      const captureRecord = await appleIAPPurchaseModel.recordCapture({
        transactionId,
        originalTransactionId,
        productId,
        purchaseDate: new Date(purchaseDateInt),
        expiresDate,
        environment: normalizedEnvironment,
        receiptData: receiptData ?? null,
      });

      res.status(200).json({
        success: true,
        purchase: captureRecord,
      } as CaptureAppleIAPResponse);
    } catch (error) {
      console.error('❌ Apple IAP capture error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to capture Apple IAP purchase',
        errorCode: 'server_error',
      });
    }
  }
);

/**
 * Link Apple IAP purchase to user account
 */
router.post(
  '/link-purchase',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        sessionToken,
        receiptData,
        transactionId,
        originalTransactionId,
        productId,
      } = req.body as LinkAppleIAPRequest;

      if (!sessionToken || !transactionId || !originalTransactionId || !productId) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: sessionToken, transactionId, originalTransactionId, productId',
          errorCode: 'iap_missing_fields',
        } as LinkAppleIAPResponseBody);
        return;
      }

      console.log('🍎 Apple IAP link request:', {
        transactionId,
        originalTransactionId,
        productId,
        hasReceipt: !!receiptData,
      });

      const userInfo = verifyPermanentSessionToken(sessionToken);
      if (!userInfo) {
        res.status(401).json({
          success: false,
          error: 'Invalid session token',
          errorCode: 'unauthorized',
        } as LinkAppleIAPResponseBody);
        return;
      }

      const userModel = new User();
      const subscriptionModel = new Subscription();

      let user = await userModel.findById(userInfo.userId);

      if (!user && process.env.NODE_ENV === 'development') {
        if (userInfo.email) {
          user = await userModel.findByEmail(userInfo.email);
        }

        if (!user) {
          user = await userModel.findByFirebaseUid(userInfo.userId);
        }
      }

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          errorCode: 'unauthorized',
        } as LinkAppleIAPResponseBody);
        return;
      }

      let purchase: any = null;
      let verifiedEnvironment: 'Sandbox' | 'Production' | null = null;

      if (receiptData && receiptData.length > 0) {
        console.log('🔍 Verifying receipt with Apple...');
        const receiptResult = await verifyAppleReceipt(receiptData);

        if (receiptResult.status !== 0) {
          console.error('❌ Apple receipt verification failed:', receiptResult);
        } else {
          console.log('✅ Apple receipt verified successfully');
          const receipt = receiptResult.receipt;
          const inAppPurchases = receipt.in_app || [];

          purchase = inAppPurchases.find(
            (p: any) =>
              p.transaction_id === transactionId ||
              p.original_transaction_id === originalTransactionId
          );

          if (!purchase) {
            console.log('⚠️ Transaction not found in receipt, using identifiers only');
          } else {
            verifiedEnvironment =
              receiptResult.environment === 'Production' ? 'Production' : 'Sandbox';
          }
        }
      }

      const ledgerBefore = await appleIAPPurchaseModel.findByOriginalTransactionId(
        originalTransactionId
      );

      const purchaseDate =
        purchase?.purchase_date_ms
          ? new Date(Number.parseInt(purchase.purchase_date_ms, 10))
          : ledgerBefore
          ? new Date(ledgerBefore.purchaseDate)
          : new Date();

      const expiresDate =
        purchase?.expires_date_ms
          ? new Date(Number.parseInt(purchase.expires_date_ms, 10))
          : ledgerBefore?.expiresDate
          ? new Date(ledgerBefore.expiresDate)
          : null;

      let resolvedEnvironment: 'Sandbox' | 'Production' | null =
        verifiedEnvironment ?? ledgerBefore?.environment ?? null;

      if (purchase && purchase.product_id && purchase.product_id !== productId) {
        res.status(400).json({
          success: false,
          error: 'Product ID mismatch',
          errorCode: 'iap_link_conflict',
        } as LinkAppleIAPResponseBody);
        return;
      }

      const ledgerEntry = await appleIAPPurchaseModel.recordCapture({
        transactionId,
        originalTransactionId,
        productId,
        purchaseDate,
        expiresDate,
        environment: resolvedEnvironment,
        receiptData: receiptData ?? null,
      });

      resolvedEnvironment =
        resolvedEnvironment ?? ledgerEntry.environment ?? null;

      if (
        ledgerEntry.linkedUserId &&
        ledgerEntry.linkedUserId !== user.id
      ) {
        res.status(409).json({
          success: false,
          error: 'Purchase already linked to another KeenVPN account',
          errorCode: 'iap_already_linked',
          linkedEmail: ledgerEntry.linkedEmail ?? null,
        } as LinkAppleIAPResponseBody);
        return;
      }

      const existingByTransaction =
        await subscriptionModel.findByAppleTransactionId(transactionId);
      if (
        existingByTransaction &&
        existingByTransaction.userId !== user.id
      ) {
        let linkedEmail = ledgerEntry.linkedEmail ?? null;
        if (!linkedEmail) {
          const linkedUser = await userModel.findById(existingByTransaction.userId);
          linkedEmail = linkedUser?.email ?? null;
        }

        res.status(409).json({
          success: false,
          error: 'Purchase already linked to another KeenVPN account',
          errorCode: 'iap_already_linked',
          linkedEmail,
        } as LinkAppleIAPResponseBody);
        return;
      }

      const existingByOriginal =
        await subscriptionModel.findByAppleOriginalTransactionId(
          originalTransactionId
        );
      if (
        existingByOriginal &&
        existingByOriginal.userId !== user.id
      ) {
        let linkedEmail = ledgerEntry.linkedEmail ?? null;
        if (!linkedEmail) {
          const linkedUser = await userModel.findById(existingByOriginal.userId);
          linkedEmail = linkedUser?.email ?? null;
        }

        res.status(409).json({
          success: false,
          error: 'Purchase already linked to another KeenVPN account',
          errorCode: 'iap_already_linked',
          linkedEmail,
        } as LinkAppleIAPResponseBody);
        return;
      }

      const targetSubscription =
        existingByTransaction ?? existingByOriginal ?? null;

      const now = new Date();
      const finalExpiresDate =
        expiresDate ?? (ledgerEntry.expiresDate ? new Date(ledgerEntry.expiresDate) : null);
      const subscriptionStatus =
        !finalExpiresDate || finalExpiresDate > now ? 'active' : 'inactive';

      const planDetails = (() => {
        switch (productId) {
          case 'com.keenvpn.premium.annual':
          case 'com.keenvpn.premium':
          case 'com.keenvpnmobile.premium.yearly':
            return {
              planName: 'Premium VPN - Annual',
              billingPeriod: 'year' as 'year',
              priceAmount: 130.99,
            };
          default:
            return {
              planName: 'Premium VPN',
              billingPeriod: 'year' as 'year',
              priceAmount: 0,
            };
        }
      })();

      let responseSubscription: SubscriptionWithAppleIAP | null = null;

      if (targetSubscription) {
        const existingStart = targetSubscription.currentPeriodStart
          ? new Date(targetSubscription.currentPeriodStart)
          : null;
        const finalStart =
          existingStart && existingStart <= purchaseDate
            ? existingStart
            : purchaseDate;

        const existingEnd = targetSubscription.currentPeriodEnd
          ? new Date(targetSubscription.currentPeriodEnd)
          : null;
        let finalEnd = finalExpiresDate ?? existingEnd ?? null;
        if (existingEnd && finalExpiresDate) {
          finalEnd = finalExpiresDate > existingEnd ? finalExpiresDate : existingEnd;
        }

        const updatePayload: UpdateSubscriptionData = {
          appleTransactionId: transactionId,
          appleProductId: productId,
          appleEnvironment: resolvedEnvironment ?? undefined,
          status: subscriptionStatus,
          planId: productId,
          planName: planDetails.planName,
          priceAmount: planDetails.priceAmount,
          priceCurrency: 'USD',
          billingPeriod: planDetails.billingPeriod,
          currentPeriodStart: finalStart,
          currentPeriodEnd: finalEnd ?? undefined,
          cancelAtPeriodEnd: false,
        };

        await subscriptionModel.update(targetSubscription.id, updatePayload);
        const refreshed = await subscriptionModel.findById(targetSubscription.id);
        responseSubscription = refreshed as SubscriptionWithAppleIAP;
      } else {
        const subscription = await subscriptionModel.create({
          userId: user.id,
          subscriptionType: 'apple_iap',
          appleTransactionId: transactionId,
          appleOriginalTransactionId: originalTransactionId,
          appleProductId: productId,
          appleEnvironment: resolvedEnvironment ?? undefined,
          status: subscriptionStatus,
          planId: productId,
          planName: planDetails.planName,
          priceAmount: planDetails.priceAmount,
          priceCurrency: 'USD',
          billingPeriod: planDetails.billingPeriod,
          currentPeriodStart: purchaseDate,
          currentPeriodEnd: finalExpiresDate ?? undefined,
          cancelAtPeriodEnd: false,
        });

        responseSubscription = subscription as SubscriptionWithAppleIAP;
      }

      await appleIAPPurchaseModel.markLinked(
        originalTransactionId,
        user.id,
        user.email ?? null
      );

      res.status(200).json({
        success: true,
        message: 'Apple IAP purchase linked successfully',
        subscription: {
          id: responseSubscription!.id,
          status: responseSubscription!.status,
          planName: responseSubscription!.planName,
          endDate: responseSubscription!.currentPeriodEnd
            ? new Date(responseSubscription!.currentPeriodEnd).toISOString()
            : null,
          subscriptionType: 'apple_iap',
        },
      } as LinkAppleIAPResponseBody);
    } catch (error) {
      console.error('❌ Apple IAP link error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to link Apple IAP purchase',
        errorCode: 'server_error',
      } as LinkAppleIAPResponseBody);
    }
  }
);

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
 * Link Apple IAP purchases using transaction IDs (for already logged-in users)
 * This is similar to what happens during sign-in, but can be called manually
 */
router.post('/link-with-transaction-ids', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken, transactionIds } = req.body;

    if (!sessionToken) {
      res.status(400).json({
        success: false,
        error: 'Session token is required'
      } as ApiResponse);
      return;
    }

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Transaction IDs array is required and must not be empty'
      } as ApiResponse);
      return;
    }

    console.log('🔗 Linking Apple IAP purchases with transaction IDs:', {
      transactionCount: transactionIds.length,
      transactionIds: JSON.stringify(transactionIds, null, 2)
    });

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
    const appleIAPPurchaseModel = new AppleIAPPurchaseModel();

    let user = await userModel.findById(userInfo.userId);

    if (!user && process.env.NODE_ENV === 'development') {
      if (userInfo.email) {
        user = await userModel.findByEmail(userInfo.email);
      }

      if (!user) {
        user = await userModel.findByFirebaseUid(userInfo.userId);
      }
    }

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      } as ApiResponse);
      return;
    }

    console.log('🔍 User found for IAP linking:', {
      userId: user.id,
      email: user.email,
      appleUserId: user.appleUserId || 'null',
      provider: user.provider
    });

    // Note: We allow IAP linking for any authenticated user, regardless of sign-in provider
    // This allows users who signed in with Google/other methods to link Apple IAP purchases
    // The appleUserId check is informational only
    if (!user.appleUserId) {
      console.log('ℹ️ User does not have appleUserId (provider: ' + (user.provider || 'unknown') + '), but allowing IAP linking anyway');
    }

    console.log(`🔄 Processing ${transactionIds.length} transaction(s) for linking...`);

    let linkedCount = 0;
    const linkedPurchases = [];
    const errors = [];

    for (const tx of transactionIds) {
      console.log(`🔍 Processing transaction:`, {
        transactionId: tx.transactionId,
        originalTransactionId: tx.originalTransactionId,
        productId: tx.productId
      });
      try {
        if (!tx.transactionId || !tx.originalTransactionId || !tx.productId) {
          errors.push({
            transaction: tx,
            error: 'Missing required fields: transactionId, originalTransactionId, productId'
          });
          continue;
        }

        // Find the purchase in our ledger, or capture it if not found
        console.log(`🔍 Looking up purchase in ledger for originalTransactionId: ${tx.originalTransactionId}`);
        let ledgerEntry = await appleIAPPurchaseModel.findByOriginalTransactionId(
          tx.originalTransactionId
        );

        if (ledgerEntry) {
          console.log(`📦 Found existing purchase in ledger:`, {
            originalTransactionId: ledgerEntry.originalTransactionId,
            linkedUserId: ledgerEntry.linkedUserId || 'null',
            productId: ledgerEntry.productId
          });
        } else {
          console.warn(
            `⚠️ Purchase not found in ledger for originalTransactionId: ${tx.originalTransactionId}, attempting to capture it first`
          );
          
          try {
            ledgerEntry = await appleIAPPurchaseModel.recordCapture({
              transactionId: tx.transactionId,
              originalTransactionId: tx.originalTransactionId,
              productId: tx.productId,
              purchaseDate: new Date(),
              expiresDate: null,
              environment: null,
              receiptData: null,
            });
            
            console.log(
              `✅ Captured purchase in ledger: ${tx.originalTransactionId}`
            );
          } catch (captureError) {
            console.error(
              `❌ Failed to capture purchase ${tx.originalTransactionId}:`,
              captureError
            );
            errors.push({
              transaction: tx,
              error: `Failed to capture purchase: ${captureError instanceof Error ? captureError.message : String(captureError)}`
            });
            continue;
          }
        }
        
        if (!ledgerEntry) {
          errors.push({
            transaction: tx,
            error: 'Could not find or capture purchase in ledger'
          });
          continue;
        }

        // Check if already linked to another user
        if (ledgerEntry.linkedUserId && ledgerEntry.linkedUserId !== user.id) {
          errors.push({
            transaction: tx,
            error: `Purchase already linked to another user: ${ledgerEntry.linkedUserId}`
          });
          continue;
        }

        // Create subscription from the purchase
        const now = new Date();
        const purchaseDate = new Date(ledgerEntry.purchaseDate);
        
        // Check if subscription already exists
        // For renewals: Apple creates new transactionId but same originalTransactionId
        // We should create a new subscription record for each billing period (renewal)
        console.log(`🔍 Checking for existing subscription...`);
        const existingByTransaction = await subscriptionModel.findByAppleTransactionId(
          tx.transactionId
        );
        
        // If subscription exists with this exact transactionId, skip (duplicate)
        if (existingByTransaction) {
          console.log(
            `📦 Subscription already exists (by transactionId): ${existingByTransaction.id} for transaction: ${tx.transactionId}`
          );
          linkedPurchases.push({
            transactionId: tx.transactionId,
            originalTransactionId: tx.originalTransactionId,
            productId: tx.productId,
            status: 'already_linked'
          });
          continue;
        }

        // Check for existing subscription with same originalTransactionId and billing period
        // If found, this is the same billing period (webhook retry or duplicate), skip
        // If not found or different billing period, create new subscription (renewal)
        const existingByOriginal = await subscriptionModel.findByAppleOriginalTransactionId(
          tx.originalTransactionId
        );
        
        if (existingByOriginal) {
          // Check if this is the same billing period
          const existingStart = existingByOriginal.currentPeriodStart 
            ? new Date(existingByOriginal.currentPeriodStart)
            : null;
          const newStart = purchaseDate;
          
          // If billing periods match (within 1 day tolerance for timing differences), skip
          if (existingStart && Math.abs(existingStart.getTime() - newStart.getTime()) < 24 * 60 * 60 * 1000) {
            console.log(
              `📦 Subscription already exists for same billing period: ${existingByOriginal.id} (period start: ${existingStart.toISOString()}), skipping creation`
            );
            linkedPurchases.push({
              transactionId: tx.transactionId,
              originalTransactionId: tx.originalTransactionId,
              productId: tx.productId,
              status: 'already_linked'
            });
            continue;
          } else {
            // Different billing period - this is a renewal (billing has occurred)
            console.log(
              `🔄 Renewal detected: Existing subscription ${existingByOriginal.id} has different billing period, creating new subscription record for renewal`
            );
            // Renewal means billing happened, so this subscription should be "active"
          }
        }
        const expiresDate = ledgerEntry.expiresDate
          ? new Date(ledgerEntry.expiresDate)
          : null;
        
        // Determine subscription status:
        // - "trialing": Initial subscription or renewal before trial period ends (introductory offer period)
        // - "active": Renewal subscription after trial period has ended (billing has occurred)
        // - "inactive": Expired
        const isExpired = expiresDate ? expiresDate <= now : false;
        
        // Check if this is a renewal (different billing period from existing subscription)
        const isRenewal = existingByOriginal !== null && existingByOriginal.currentPeriodStart 
          ? Math.abs(new Date(existingByOriginal.currentPeriodStart).getTime() - purchaseDate.getTime()) >= 24 * 60 * 60 * 1000
          : false;
        
        // If it's a renewal, check if the trial period has ended (30 days from initial purchase)
        // Trial period ends 30 days after the FIRST subscription's purchase date
        let trialPeriodEnded = false;
        if (isRenewal && existingByOriginal) {
          // Find the earliest subscription (initial purchase) with this originalTransactionId
          // to calculate the true trial end date
          const allSubscriptions = await subscriptionModel.findAllByUserId(user.id);
          const subscriptionsWithSameOriginal = allSubscriptions.filter(
            (sub: any) => sub.appleOriginalTransactionId === tx.originalTransactionId
          );
          
          // Find the earliest subscription (initial purchase)
          const firstSubscription = subscriptionsWithSameOriginal.length > 0
            ? subscriptionsWithSameOriginal.reduce((earliest: any, current: any) => {
                const earliestDate = earliest.currentPeriodStart ? new Date(earliest.currentPeriodStart) : new Date(0);
                const currentDate = current.currentPeriodStart ? new Date(current.currentPeriodStart) : new Date(0);
                return currentDate < earliestDate ? current : earliest;
              })
            : existingByOriginal;
          
          const firstPurchaseDate = firstSubscription.currentPeriodStart 
            ? new Date(firstSubscription.currentPeriodStart)
            : purchaseDate;
          
          // Trial period is 30 days from initial purchase
          const trialEndDate = new Date(firstPurchaseDate);
          trialEndDate.setDate(trialEndDate.getDate() + 30);
          
          // Check if current purchase date is after trial end date
          trialPeriodEnded = purchaseDate >= trialEndDate;
          
          console.log(`🔍 Trial period check:`, {
            firstPurchaseDate: firstPurchaseDate.toISOString(),
            trialEndDate: trialEndDate.toISOString(),
            currentPurchaseDate: purchaseDate.toISOString(),
            trialPeriodEnded,
            daysSinceTrialStart: Math.floor((purchaseDate.getTime() - firstPurchaseDate.getTime()) / (1000 * 60 * 60 * 24))
          });
        }
        
        let subscriptionStatus: 'trialing' | 'active' | 'inactive';
        if (isExpired) {
          subscriptionStatus = 'inactive';
        } else if (isRenewal && trialPeriodEnded) {
          // Renewal after trial period ended means billing occurred, so mark as "active"
          subscriptionStatus = 'active';
        } else {
          // Initial subscription or renewal before trial ends: always "trialing"
          subscriptionStatus = 'trialing';
        }
        
        console.log(`📊 Subscription status determined: ${subscriptionStatus}`, {
          isRenewal,
          isExpired,
          purchaseDate: purchaseDate.toISOString(),
          expiresDate: expiresDate?.toISOString(),
          existingSubscriptionId: existingByOriginal?.id
        });

        // Determine plan details from product ID
        const planDetails = (() => {
          const productId = tx.productId || ledgerEntry.productId;
          if (productId.includes('monthly')) {
            return {
              planName: 'Premium VPN - Monthly',
              billingPeriod: 'month' as const,
              priceAmount: 12.99,
            };
          } else if (
            productId.includes('annual') ||
            productId.includes('yearly') ||
            productId === 'com.keenvpn.premium'
          ) {
            return {
              planName: 'Premium VPN - Annual',
              billingPeriod: 'year' as const,
              priceAmount: 119.99,
            };
          }
          return {
            planName: 'Premium VPN',
            billingPeriod: 'year' as const,
            priceAmount: 0,
          };
        })();

        // Create subscription and mark as linked atomically with rollback
        let createdSubscriptionId: string | null = null;
        
        try {
          // Step 1: Create subscription
          const newSubscription = await subscriptionModel.create({
            userId: user.id,
            subscriptionType: 'apple_iap',
            appleTransactionId: tx.transactionId,
            appleOriginalTransactionId: tx.originalTransactionId,
            appleProductId: tx.productId || ledgerEntry.productId,
            appleEnvironment: ledgerEntry.environment ?? undefined,
            status: subscriptionStatus,
            planId: tx.productId || ledgerEntry.productId,
            planName: planDetails.planName,
            priceAmount: planDetails.priceAmount,
            priceCurrency: 'USD',
            billingPeriod: planDetails.billingPeriod,
            currentPeriodStart: purchaseDate,
            currentPeriodEnd: expiresDate ?? undefined,
            cancelAtPeriodEnd: false,
          });
          
          createdSubscriptionId = newSubscription.id;
          console.log(
            `✅ Created subscription ${createdSubscriptionId} for transaction: ${tx.originalTransactionId}`
          );

          // Step 1.5: Grant trial if user is eligible (trials only granted when subscribing)
          try {
            const { default: User } = await import('../models/User.js');
            const userModel = new User();
            const fullUser = await userModel.findById(user.id);
            if (fullUser) {
              const trialResult = await trialService.grantIfEligible(fullUser, null);
              if (trialResult.granted) {
                console.log('✅ Trial granted on subscription:', {
                  userId: trialResult.userId,
                  trialEndsAt: trialResult.trialEndsAt?.toISOString()
                });
              }
            }
          } catch (trialError) {
            // Don't fail subscription creation if trial grant fails
            console.warn('⚠️ Failed to grant trial on subscription (non-fatal):', trialError);
          }

          // Step 2: Mark purchase as linked
          try {
            await appleIAPPurchaseModel.markLinked(
              tx.originalTransactionId,
              user.id,
              user.email ?? null
            );
            
            console.log(
              `✅ Linked Apple IAP purchase to user ${user.id}: ${tx.originalTransactionId}`
            );
            
            linkedCount++;
            linkedPurchases.push({
              transactionId: tx.transactionId,
              originalTransactionId: tx.originalTransactionId,
              productId: tx.productId,
              status: 'linked',
              subscriptionId: createdSubscriptionId
            });
          } catch (markLinkedError) {
            // Rollback: Delete subscription if marking as linked fails
            console.error(
              `❌ Failed to mark purchase as linked, rolling back subscription creation:`,
              markLinkedError
            );
            
            try {
              await subscriptionModel.delete(createdSubscriptionId);
              console.log(
                `✅ Rolled back: Deleted subscription ${createdSubscriptionId}`
              );
            } catch (deleteError) {
              console.error(
                `❌ Failed to rollback subscription ${createdSubscriptionId}:`,
                deleteError
              );
              console.error(
                `🚨 MANUAL CLEANUP NEEDED: Orphaned subscription ${createdSubscriptionId} for transaction ${tx.originalTransactionId}`
              );
            }
            
            errors.push({
              transaction: tx,
              error: `Failed to mark as linked: ${markLinkedError instanceof Error ? markLinkedError.message : String(markLinkedError)}`
            });
          }
        } catch (linkError) {
          console.error(
            `❌ Failed to link purchase ${tx.originalTransactionId}:`,
            linkError
          );
          
          if (createdSubscriptionId) {
            console.error(
              `⚠️ Subscription ${createdSubscriptionId} may need manual cleanup`
            );
          }
          
          errors.push({
            transaction: tx,
            error: `Failed to create subscription: ${linkError instanceof Error ? linkError.message : String(linkError)}`
          });
        }
      } catch (error) {
        console.error(
          `⚠️ Unexpected error processing transaction ${tx.originalTransactionId}:`,
          error
        );
        errors.push({
          transaction: tx,
          error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }

    console.log(`✅ Linked ${linkedCount} out of ${transactionIds.length} Apple IAP purchase(s)`);

    res.status(200).json({
      success: true,
      message: `Linked ${linkedCount} purchase(s)`,
      linkedCount,
      totalCount: transactionIds.length,
      linkedPurchases,
      errors: errors.length > 0 ? errors : undefined
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Apple IAP link-with-transaction-ids error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link Apple IAP purchases'
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
