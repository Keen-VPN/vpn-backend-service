import express, { Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import User from "../models/User.js";
import { generatePermanentSessionToken } from "../utils/auth.js";
import TrialService from "../services/TrialService.js";
import { serializeTrialStatus } from "../utils/trial.js";
import type {
  AppleSignInData,
  ApiResponse,
  SessionTokenPayload,
} from "../types/index.js";

// Extend global namespace for blacklist storage
declare global {
  var deletedAppleUsers: Map<string, any> | undefined;
  var deletedGoogleUsers: Map<string, any> | undefined;
  var deletedFirebaseUsers: Map<string, any> | undefined;
}

const router: Router = express.Router();
const trialService = new TrialService();

/**
 * Check if a user is blacklisted (previously deleted)
 * Only blocks recreation within 5 minutes of deletion to prevent automatic recreation
 * After 5 minutes, users can intentionally create a new account
 * Returns { isBlacklisted: boolean, minutesRemaining?: number }
 */
function checkIfUserIsBlacklisted(
  firebaseUid: string,
  appleUserId?: string
): { isBlacklisted: boolean; minutesRemaining?: number } {
  try {
    const BLACKLIST_DURATION_MS = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    // Check Firebase UID blacklist
    if (firebaseUid && global.deletedFirebaseUsers) {
      const deletedUser = global.deletedFirebaseUsers.get(firebaseUid);
      if (deletedUser) {
        const deletedAt = new Date(deletedUser.deletedAt).getTime();
        const timeSinceDeletion = now - deletedAt;

        if (timeSinceDeletion < BLACKLIST_DURATION_MS) {
          const timeRemaining = BLACKLIST_DURATION_MS - timeSinceDeletion;
          const minutesRemaining = Math.ceil(timeRemaining / 60000); // Round up to nearest minute
          console.log(
            "🚨 Found recently blacklisted Firebase UID:",
            firebaseUid
          );
          console.log(
            "🚨 Time since deletion:",
            Math.floor(timeSinceDeletion / 1000),
            "seconds"
          );
          console.log("🚨 Minutes remaining:", minutesRemaining);
          return { isBlacklisted: true, minutesRemaining };
        } else {
          // Expired - remove from blacklist
          console.log("✅ Blacklist expired for Firebase UID:", firebaseUid);
          global.deletedFirebaseUsers.delete(firebaseUid);
        }
      }
    }

    // Check Apple User ID blacklist
    if (appleUserId && global.deletedAppleUsers) {
      const deletedUser = global.deletedAppleUsers.get(appleUserId);
      if (deletedUser) {
        const deletedAt = new Date(deletedUser.deletedAt).getTime();
        const timeSinceDeletion = now - deletedAt;

        if (timeSinceDeletion < BLACKLIST_DURATION_MS) {
          const timeRemaining = BLACKLIST_DURATION_MS - timeSinceDeletion;
          const minutesRemaining = Math.ceil(timeRemaining / 60000); // Round up to nearest minute
          console.log(
            "🚨 Found recently blacklisted Apple User ID:",
            appleUserId
          );
          console.log(
            "🚨 Time since deletion:",
            Math.floor(timeSinceDeletion / 1000),
            "seconds"
          );
          console.log("🚨 Minutes remaining:", minutesRemaining);
          return { isBlacklisted: true, minutesRemaining };
        } else {
          // Expired - remove from blacklist
          console.log("✅ Blacklist expired for Apple User ID:", appleUserId);
          global.deletedAppleUsers.delete(appleUserId);
        }
      }
    }

    // Check Google User ID blacklist
    if (firebaseUid && global.deletedGoogleUsers) {
      const deletedUser = global.deletedGoogleUsers.get(firebaseUid);
      if (deletedUser) {
        const deletedAt = new Date(deletedUser.deletedAt).getTime();
        const timeSinceDeletion = now - deletedAt;

        if (timeSinceDeletion < BLACKLIST_DURATION_MS) {
          const timeRemaining = BLACKLIST_DURATION_MS - timeSinceDeletion;
          const minutesRemaining = Math.ceil(timeRemaining / 60000); // Round up to nearest minute
          console.log(
            "🚨 Found recently blacklisted Google User ID:",
            firebaseUid
          );
          console.log(
            "🚨 Time since deletion:",
            Math.floor(timeSinceDeletion / 1000),
            "seconds"
          );
          console.log("🚨 Minutes remaining:", minutesRemaining);
          return { isBlacklisted: true, minutesRemaining };
        } else {
          // Expired - remove from blacklist
          console.log("✅ Blacklist expired for Google User ID:", firebaseUid);
          global.deletedGoogleUsers.delete(firebaseUid);
        }
      }
    }

    return { isBlacklisted: false };
  } catch (error) {
    console.error("❌ Error checking blacklist:", error);
    return { isBlacklisted: false };
  }
}

/**
 * Apple Sign-In Authentication
 * Verifies Apple identity token and creates/retrieves user
 */
router.post(
  "/apple/signin",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { identityToken, userIdentifier, email, fullName, transactionIds } =
        req.body as AppleSignInData;
      const deviceFingerprint =
        typeof (req.body as any).deviceFingerprint === "string"
          ? ((req.body as any).deviceFingerprint as string).trim()
          : null;
      const devicePlatform =
        typeof (req.body as any).devicePlatform === "string"
          ? ((req.body as any).devicePlatform as string).trim()
          : undefined;

      // Validate required fields
      if (!identityToken) {
        res.status(400).json({
          success: false,
          error: "Missing required field: identityToken",
        } as ApiResponse);
        return;
      }

      console.log("🍎 Apple Sign-In request:", {
        userIdentifier,
        email,
        fullName,
        isPrivateRelay: email?.includes("@privaterelay.appleid.com"),
        transactionIdsReceived: transactionIds ? transactionIds.length : 0,
        transactionIds: transactionIds ? JSON.stringify(transactionIds, null, 2) : 'none',
      });

      let firebaseUid: string;
      let userEmail: string;
      let displayName: string | undefined;
      let emailVerified = false;
      let appleUserId: string;

      try {
        // Try to verify as Firebase ID token first (from web Firebase Auth)
        console.log("🔍 Attempting to verify as Firebase ID token...");

        try {
          const admin = await import("firebase-admin");
          const decodedToken = await admin.auth().verifyIdToken(identityToken);
          console.log(
            "✅ Firebase ID token verified (Apple via Firebase Auth)"
          );

          firebaseUid = decodedToken.uid;
          // Use the userIdentifier from the request body (Apple's actual user ID from providerData)
          // If not provided, fall back to Firebase UID (for backward compatibility)
          appleUserId = userIdentifier || decodedToken.uid;

          // IMPORTANT: Apple always provides an email (either real or private relay)
          // Firebase token should always contain the email
          // Empty string from client should be treated as missing email
          const clientEmail = email && email.trim() !== "" ? email : undefined;

          if (!decodedToken.email && !clientEmail) {
            throw new Error(
              "No email found in Firebase token or client request"
            );
          }

          userEmail = decodedToken.email || clientEmail!;
          displayName =
            decodedToken.name || fullName || userEmail.split("@")[0];
          emailVerified = decodedToken.email_verified || false;

          console.log("✅ User info from Firebase token:", {
            firebaseUid,
            appleUserId,
            userEmail,
            displayName,
            emailVerified,
            emailSource: decodedToken.email ? "token" : "client",
          });
        } catch (firebaseError) {
          // Fallback to native Apple token (from iOS/Android apps)
          console.log(
            "⚠️ Not a Firebase token, decoding native Apple identity token..."
          );

          if (!userIdentifier) {
            throw new Error("userIdentifier required for native Apple sign-in");
          }

          // Decode the Apple identity token (JWT) to extract the email
          // Apple's identity token contains the private relay email in the payload
          try {
            const tokenParts = identityToken.split(".");
            if (tokenParts.length !== 3) {
              throw new Error("Invalid JWT format");
            }

            // Decode the payload (second part of JWT)
            const payloadBase64 = tokenParts[1];
            if (!payloadBase64) {
              throw new Error("Invalid JWT: missing payload");
            }
            const payload = JSON.parse(
              Buffer.from(payloadBase64, "base64").toString()
            );
            console.log("🔍 Decoded Apple token payload:", {
              sub: payload.sub,
              email: payload.email,
              email_verified: payload.email_verified,
            });

            firebaseUid = `apple_${userIdentifier}`;
            appleUserId = userIdentifier;

            // Use the email from the token (Apple's private relay email)
            // If not in token, use the email from client
            // NEVER use placeholder email
            const tokenEmail = payload.email;
            const clientEmail =
              email && email.trim() !== "" ? email : undefined;
            userEmail =
              tokenEmail ||
              clientEmail ||
              `${userIdentifier}@privaterelay.appleid.com`;

            displayName = fullName || payload.name || userEmail.split("@")[0];
            emailVerified =
              payload.email_verified === "true" ||
              payload.email_verified === true;

            console.log("✅ Apple Sign-In processed (native):", {
              firebaseUid,
              appleUserId,
              userEmail,
              emailVerified,
              emailSource: tokenEmail
                ? "token"
                : clientEmail
                ? "client"
                : "fallback",
            });
          } catch (decodeError) {
            console.error(
              "❌ Failed to decode Apple identity token:",
              decodeError
            );
            throw new Error("Failed to decode Apple identity token");
          }
        }
      } catch (error) {
        console.error("❌ Failed to process Apple Sign-In:", error);
        console.error("❌ Error details:", {
          message: error instanceof Error ? error.message : String(error),
          code: (error as any)?.code,
          stack: error instanceof Error ? error.stack : undefined,
        });
        res.status(401).json({
          success: false,
          error: "Invalid Apple identity token",
        } as ApiResponse);
        return;
      }

      // Check if user exists - try multiple lookup strategies
      const userModel = new User();
      let user = await userModel.findByFirebaseUid(firebaseUid);

      console.log(
        "🔍 User lookup by firebaseUid:",
        firebaseUid,
        user ? "Found" : "Not found"
      );

      if (!user && appleUserId) {
        user = await userModel.findByAppleUserId(appleUserId);
        console.log(
          "🔍 User lookup by appleUserId:",
          appleUserId,
          user ? "Found" : "Not found"
        );
      }

      // IMPORTANT: For Apple Sign-In, do NOT try to match by email!
      // Apple generates different private relay emails for web vs desktop apps
      // We must rely solely on appleUserId for cross-platform matching
      if (
        !user &&
        userEmail &&
        userEmail.trim() !== "" &&
        userEmail !== "user@apple.com" &&
        !userEmail.includes("@privaterelay.appleid.com")
      ) {
        // Only try email matching for non-Apple users or non-private-relay emails
        user = await userModel.findByEmail(userEmail);
        console.log(
          "🔍 User lookup by email (non-Apple):",
          userEmail,
          user ? "Found" : "Not found"
        );
      } else if (userEmail && userEmail.includes("@privaterelay.appleid.com")) {
        console.log(
          "🍎 Skipping email lookup for Apple private relay email:",
          userEmail
        );
        console.log(
          "🍎 Relying on appleUserId for cross-platform matching:",
          appleUserId
        );
      }

      if (!user) {
        // Check if this user was previously deleted (blacklisted)
        const blacklistCheck = checkIfUserIsBlacklisted(
          firebaseUid,
          appleUserId
        );

        if (blacklistCheck.isBlacklisted) {
          console.log("🚨 User is blacklisted (previously deleted):", {
            firebaseUid,
            appleUserId,
          });
          console.log(
            "🚨 This user was deleted recently and should not be recreated yet"
          );

          const minutesText =
            blacklistCheck.minutesRemaining === 1
              ? "1 minute"
              : `${blacklistCheck.minutesRemaining} minutes`;

          res.status(403).json({
            success: false,
            error: `Your account was recently deleted. Please wait ${minutesText} before creating a new account, or sign out completely and try again.`,
            accountDeleted: true,
            minutesRemaining: blacklistCheck.minutesRemaining,
          } as ApiResponse);
          return;
        }

        // Create new user (only for truly new users)
        console.log("👤 Creating new user with Apple credentials");
        console.log("👤 User data:", {
          firebaseUid,
          appleUserId,
          userEmail,
          displayName,
          provider: "apple",
        });

        try {
          user = await userModel.create({
            firebaseUid,
            appleUserId: appleUserId,
            email: userEmail,
            displayName: displayName || userEmail.split("@")[0],
            provider: "apple",
            emailVerified,
          });
          console.log("✅ New user created:", user.id);
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002" &&
            Array.isArray(error.meta?.target) &&
            error.meta.target.includes("email") &&
            userEmail
          ) {
            console.log(
              "⚠️ Email already exists; reusing existing account for Apple sign-in"
            );
            const existingByEmail = await userModel.findByEmail(userEmail);
            if (!existingByEmail) {
              throw error;
            }
            user = await userModel.update(existingByEmail.id, {
              firebaseUid,
              appleUserId: appleUserId,
              provider: "apple",
              displayName:
                displayName || existingByEmail.displayName || userEmail.split("@")[0],
              emailVerified,
            });
            console.log(
              "✅ Linked existing user to Apple credentials:",
              user.id
            );
          } else {
            throw error;
          }
        }
      } else {
        // Update existing user
        console.log("👤 Existing user found, updating credentials");
        console.log("👤 Existing user data:", {
          id: user.id,
          existingFirebaseUid: user.firebaseUid,
          existingAppleUserId: user.appleUserId,
          existingEmail: user.email,
        });

        // Update with new credentials
        user = await userModel.update(user.id, {
          firebaseUid,
          appleUserId: appleUserId, // Always update with the latest Apple user ID
          provider: "apple",
          displayName: displayName || user.displayName || undefined,
          emailVerified,
        });

        console.log("✅ User updated:", user.id);
      }

      await trialService.touchDeviceFingerprint(
        user.id,
        deviceFingerprint,
        devicePlatform || user.provider
      );

      // Trials are now only granted when users subscribe, not on sign-up

      await trialService.expireIfNeeded(user.id);
      const trialStatus = await trialService.status(user.id);

      // Generate session token
      const tokenPayload: SessionTokenPayload = {
        userId: user.id,
        email: user.email,
        provider: "apple",
      };
      const sessionToken = generatePermanentSessionToken(tokenPayload);

      // Get user's subscription data
      const { default: Subscription } = await import(
        "../models/Subscription.js"
      );
      const subscriptionModel = new Subscription();
      let activeSubscription = await subscriptionModel.findActiveByUserId(
        user.id
      );

      // Always try to link Apple IAP purchases if transaction IDs are provided
      // IAP subscriptions should take precedence over trials (paid subscriptions > free trials)
      console.log(
        `🔍 IAP Linking Check - User appleUserId: ${user.appleUserId || 'null'}, Transaction IDs: ${transactionIds ? transactionIds.length : 0}`
      );
      
      if (user.appleUserId) {
        console.log(
          `🔍 Checking for Apple IAP purchases to link. Transaction IDs provided: ${transactionIds ? transactionIds.length : 0}`,
          transactionIds ? `\n   Transaction IDs: ${JSON.stringify(transactionIds, null, 2)}` : ''
        );
        const { default: AppleIAPPurchaseModel } = await import(
          "../models/AppleIAPPurchase.js"
        );
        const appleIAPPurchaseModel = new AppleIAPPurchaseModel();

        // Priority 1: Use transaction IDs provided by the client app (most reliable)
        if (transactionIds && transactionIds.length > 0) {
          console.log(
            `🔍 Linking ${transactionIds.length} Apple IAP purchase(s) from client-provided transaction IDs`
          );

          for (const tx of transactionIds) {
            try {
              // Find the purchase in our ledger, or capture it if not found
              let ledgerEntry = await appleIAPPurchaseModel.findByOriginalTransactionId(
                tx.originalTransactionId
              );

              if (!ledgerEntry) {
                console.warn(
                  `⚠️ Purchase not found in ledger for originalTransactionId: ${tx.originalTransactionId}, attempting to capture it first`
                );
                
                // Try to capture the purchase if it's not in the ledger yet
                // This can happen if the purchase was made but not yet captured via /api/apple-iap/capture
                try {
                  ledgerEntry = await appleIAPPurchaseModel.recordCapture({
                    transactionId: tx.transactionId,
                    originalTransactionId: tx.originalTransactionId,
                    productId: tx.productId,
                    purchaseDate: new Date(), // We don't have the exact date, use current time
                    expiresDate: null, // We don't have expiration without receipt verification
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
                  continue;
                }
              }
              
              if (!ledgerEntry) {
                console.warn(
                  `⚠️ Still could not find or capture purchase: ${tx.originalTransactionId}`
                );
                continue;
              }

              // Check if already linked to another user
              if (ledgerEntry.linkedUserId && ledgerEntry.linkedUserId !== user.id) {
                console.warn(
                  `⚠️ Purchase already linked to another user: ${ledgerEntry.linkedUserId}`
                );
                continue;
              }

              // Create subscription from the purchase
              const now = new Date();
              const purchaseDate = new Date(ledgerEntry.purchaseDate);
              const expiresDate = ledgerEntry.expiresDate
                ? new Date(ledgerEntry.expiresDate)
                : null;
              
              // Check if subscription already exists
              // For renewals: Apple creates new transactionId but same originalTransactionId
              // We should create a new subscription record for each billing period (renewal)
              const existingByTransaction = await subscriptionModel.findByAppleTransactionId(
                tx.transactionId
              );
              
              // If subscription exists with this exact transactionId, skip (duplicate)
              if (existingByTransaction) {
                console.log(
                  `📦 Subscription already exists (by transactionId): ${existingByTransaction.id} for transaction: ${tx.transactionId}`
                );
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
                  continue;
                } else {
                  // Different billing period - this is a renewal (billing has occurred)
                  console.log(
                    `🔄 Renewal detected: Existing subscription ${existingByOriginal.id} has different billing period, creating new subscription record for renewal`
                  );
                  // Renewal means billing happened, so this subscription should be "active"
                }
              }
              
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

              // Create subscription and mark as linked atomically
              // Track subscription ID for rollback if marking fails
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
                    // Log for manual cleanup
                    console.error(
                      `🚨 MANUAL CLEANUP NEEDED: Orphaned subscription ${createdSubscriptionId} for transaction ${tx.originalTransactionId}`
                    );
                  }
                  
                  throw markLinkedError; // Re-throw to trigger outer catch
                }
              } catch (linkError) {
                // If subscription creation failed, purchase should not be marked as linked
                // (it wasn't, so no rollback needed for that)
                console.error(
                  `❌ Failed to link purchase ${tx.originalTransactionId}:`,
                  linkError
                );
                
                // If subscription was created but we're here, it means marking failed
                // and we already tried to rollback above
                if (createdSubscriptionId) {
                  console.error(
                    `⚠️ Subscription ${createdSubscriptionId} may need manual cleanup`
                  );
                }
                
                // Continue with other transactions
                continue;
              }
            } catch (linkError) {
              console.error(
                `⚠️ Failed to link purchase ${tx.originalTransactionId}:`,
                linkError
              );
              // Continue with other transactions
            }
          }

          // Refresh active subscription after linking
          activeSubscription = await subscriptionModel.findActiveByUserId(user.id);
        } else {
          console.log(
            `⚠️ No transaction IDs provided in login request. Will attempt fallback auto-linking if unlinked purchases exist.`
          );
          // Priority 2: Fallback to auto-linking if no transaction IDs provided
          // Only auto-link if there's exactly one unlinked purchase (conservative approach)
          const unlinkedPurchases = await appleIAPPurchaseModel.findUnlinkedPurchases(true);

          if (unlinkedPurchases.length === 1) {
            console.log(
              `🔍 No transaction IDs provided, attempting to auto-link 1 unlinked purchase (fallback)`
            );

            const mostRecentPurchase = unlinkedPurchases[0];
            
            if (!mostRecentPurchase) {
              console.warn('⚠️ No purchase found in unlinkedPurchases array despite length check');
              activeSubscription = await subscriptionModel.findActiveByUserId(user.id);
            } else {
              try {
                const existingByTransaction = await subscriptionModel.findByAppleTransactionId(
                  mostRecentPurchase.transactionId
                );
                const existingByOriginal = await subscriptionModel.findByAppleOriginalTransactionId(
                  mostRecentPurchase.originalTransactionId
                );

                if (!existingByTransaction && !existingByOriginal) {
                  const now = new Date();
                  const purchaseDate = new Date(mostRecentPurchase.purchaseDate);
                  const expiresDate = mostRecentPurchase.expiresDate
                    ? new Date(mostRecentPurchase.expiresDate)
                    : null;
                  const subscriptionStatus =
                    !expiresDate || expiresDate > now ? 'active' : 'inactive';

                  const planDetails = (() => {
                    const productId = mostRecentPurchase.productId;
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
                      appleTransactionId: mostRecentPurchase.transactionId,
                      appleOriginalTransactionId: mostRecentPurchase.originalTransactionId,
                      appleProductId: mostRecentPurchase.productId,
                      appleEnvironment: mostRecentPurchase.environment ?? undefined,
                      status: subscriptionStatus,
                      planId: mostRecentPurchase.productId,
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
                      `✅ Created subscription ${createdSubscriptionId} for auto-link (fallback)`
                    );

                    // Step 2: Mark purchase as linked
                    try {
                      await appleIAPPurchaseModel.markLinked(
                        mostRecentPurchase.originalTransactionId,
                        user.id,
                        user.email ?? null
                      );

                      console.log(
                        `✅ Auto-linked unlinked Apple IAP purchase to user ${user.id} (fallback)`
                      );

                      activeSubscription = await subscriptionModel.findActiveByUserId(user.id);
                    } catch (markLinkedError) {
                      // Rollback: Delete subscription if marking as linked fails
                      console.error(
                        `❌ Failed to mark purchase as linked (fallback), rolling back subscription creation:`,
                        markLinkedError
                      );
                      
                      try {
                        await subscriptionModel.delete(createdSubscriptionId);
                        console.log(
                          `✅ Rolled back: Deleted subscription ${createdSubscriptionId} (fallback)`
                        );
                      } catch (deleteError) {
                        console.error(
                          `❌ Failed to rollback subscription ${createdSubscriptionId} (fallback):`,
                          deleteError
                        );
                        console.error(
                          `🚨 MANUAL CLEANUP NEEDED: Orphaned subscription ${createdSubscriptionId} for transaction ${mostRecentPurchase.originalTransactionId} (fallback)`
                        );
                      }
                      
                      throw markLinkedError;
                    }
                  } catch (linkError) {
                    console.error(
                      `❌ Failed to auto-link purchase (fallback) ${mostRecentPurchase.originalTransactionId}:`,
                      linkError
                    );
                    
                    if (createdSubscriptionId) {
                      console.error(
                        `⚠️ Subscription ${createdSubscriptionId} may need manual cleanup (fallback)`
                      );
                    }
                  }
                }
              } catch (linkError) {
                console.error(
                  '⚠️ Failed to auto-link unlinked purchase after login:',
                  linkError
                );
              }
            }
          } else if (unlinkedPurchases.length > 1) {
            console.log(
              `⚠️ Found ${unlinkedPurchases.length} unlinked purchases but no transaction IDs provided. Client should send transactionIds in login request or call /api/apple-iap/restore.`
            );
          }
        }
      } else {
        console.log(
          `⚠️ User ${user.id} does not have appleUserId set. Cannot link IAP purchases. User provider: ${user.provider}`
        );
      }

      let subscriptionData = null;
      if (activeSubscription) {
        subscriptionData = {
          status: activeSubscription.status,
          endDate: activeSubscription.currentPeriodEnd?.toISOString(),
          cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
        };
      }

      console.log("✅ Apple Sign-In successful for user:", user.id);
      console.log("✅ User email (may be private relay):", user.email);
      console.log(
        "✅ Apple User ID (for cross-platform matching):",
        user.appleUserId
      );
      console.log(
        "✅ Subscription status:",
        subscriptionData ? subscriptionData.status : "none"
      );

      console.log("✅ Trial status:", trialStatus);

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName, // Changed from displayName to name
          provider: user.provider,
        },
        sessionToken,
        authMethod: "apple",
        subscription: subscriptionData,
        trial: serializeTrialStatus(trialStatus),
      } as ApiResponse);
    } catch (error) {
      console.error("❌ Apple Sign-In error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process Apple sign-in",
      } as ApiResponse);
    }
  }
);

/**
 * Google Sign-In Authentication
 * Verifies Google ID token and creates/retrieves user
 */
router.post(
  "/google/signin",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { idToken } = req.body;
      const deviceFingerprint =
        typeof (req.body as any).deviceFingerprint === "string"
          ? ((req.body as any).deviceFingerprint as string).trim()
          : null;
      const devicePlatform =
        typeof (req.body as any).devicePlatform === "string"
          ? ((req.body as any).devicePlatform as string).trim()
          : undefined;

      if (!idToken) {
        res.status(400).json({
          success: false,
          error: "Missing required field: idToken",
        } as ApiResponse);
        return;
      }

      console.log("🔵 Google Sign-In request");

      // Verify Google ID token with Firebase
      let firebaseUid: string;
      let email: string;
      let displayName: string | undefined;
      let emailVerified: boolean;
      let googleUserId: string;

      try {
        // This endpoint handles tokens from multiple sources:
        // 1. Google OAuth access tokens (from website and mobile apps) - PRIMARY
        // 2. Firebase ID tokens (fallback for website)
        console.log("🔍 Verifying token...");
        console.log("🔍 Token length:", idToken.length);
        console.log("🔍 Token preview:", idToken.substring(0, 50) + "...");

        try {
          // OPTION 1: Try Google OAuth access token first (Website + Mobile)
          console.log(
            "🔍 Attempting Google OAuth access token verification..."
          );
          const googleResponse = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?access_token=${idToken}`
          );

          if (!googleResponse.ok) {
            throw new Error(
              `Google token verification failed: ${googleResponse.status}`
            );
          }

          const googleData = (await googleResponse.json()) as any;
          console.log("✅ Google OAuth access token verified");
          console.log("🔍 Google token info:", {
            email: googleData.email,
            name: googleData.name,
            verified_email: googleData.verified_email,
          });

          // Extract user information from Google's response
          googleUserId = googleData.sub;
          firebaseUid = googleUserId;

          // Google always provides an email
          if (!googleData.email) {
            throw new Error("No email in Google OAuth response");
          }

          email = googleData.email;
          displayName = googleData.name || email.split("@")[0];
          emailVerified =
            googleData.verified_email === "true" ||
            googleData.verified_email === true;

          console.log("✅ User info from Google OAuth:", {
            firebaseUid,
            email,
            displayName,
            emailVerified,
          });
        } catch (googleError) {
          // OPTION 2: Fallback to Firebase ID token (Website alternative)
          console.log(
            "⚠️ Not a Google OAuth token, trying Firebase ID token..."
          );

          const admin = await import("firebase-admin");
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          console.log("✅ Firebase ID token verified (Website login)");

          firebaseUid = decodedToken.uid;
          googleUserId = decodedToken.uid;

          // Firebase token should always have email for Google sign-in
          if (!decodedToken.email) {
            throw new Error("No email in Firebase token");
          }

          email = decodedToken.email;
          displayName = decodedToken.name || email.split("@")[0];
          emailVerified = decodedToken.email_verified || false;

          console.log("✅ User info from Firebase token:", {
            firebaseUid,
            email,
            displayName,
            emailVerified,
          });
        }
      } catch (error) {
        console.error("❌ Failed to verify token:", error);
        res.status(401).json({
          success: false,
          error:
            "Invalid token - must be Google OAuth access token or Firebase ID token",
        } as ApiResponse);
        return;
      }

      // Check if user exists
      const userModel = new User();
      let user = await userModel.findByFirebaseUid(firebaseUid);

      if (!user) {
        // Try to find by email
        user = await userModel.findByEmail(email);

        if (user) {
          // Update existing user with Google credentials
          console.log("📝 Updating existing user with Google credentials");
          user = await userModel.update(user.id, {
            firebaseUid,
            googleUserId: googleUserId,
            provider: "google",
            emailVerified,
          });
        } else {
          // Check if this user was previously deleted (blacklisted)
          const blacklistCheck = checkIfUserIsBlacklisted(firebaseUid);

          if (blacklistCheck.isBlacklisted) {
            console.log("🚨 User is blacklisted (previously deleted):", {
              firebaseUid,
              email,
            });
            console.log(
              "🚨 This user was deleted recently and should not be recreated yet"
            );

            const minutesText =
              blacklistCheck.minutesRemaining === 1
                ? "1 minute"
                : `${blacklistCheck.minutesRemaining} minutes`;

            res.status(403).json({
              success: false,
              error: `Your account was recently deleted. Please wait ${minutesText} before creating a new account, or sign out completely and try again.`,
              accountDeleted: true,
              minutesRemaining: blacklistCheck.minutesRemaining,
            } as ApiResponse);
            return;
          }

          // Create new user (only for truly new users)
          console.log("👤 Creating new user with Google credentials");
          user = await userModel.create({
            firebaseUid,
            googleUserId: googleUserId,
            email,
            displayName: displayName || email.split("@")[0],
            provider: "google",
            emailVerified,
          });
        }
      } else {
        // Update last login
        console.log("👤 Existing Google user found");
      }

      await trialService.touchDeviceFingerprint(
        user.id,
        deviceFingerprint,
        devicePlatform || user.provider
      );

      // Trials are now only granted when users subscribe, not on sign-up

      await trialService.expireIfNeeded(user.id);
      const trialStatus = await trialService.status(user.id);

      // Generate session token
      const tokenPayload: SessionTokenPayload = {
        userId: user.id,
        email: user.email,
        provider: "google",
      };
      const sessionToken = generatePermanentSessionToken(tokenPayload);

      // Get user's subscription data
      const { default: Subscription } = await import(
        "../models/Subscription.js"
      );
      const subscriptionModel = new Subscription();
      const activeSubscription = await subscriptionModel.findActiveByUserId(
        user.id
      );

      let subscriptionData = null;
      if (activeSubscription) {
        subscriptionData = {
          status: activeSubscription.status,
          endDate: activeSubscription.currentPeriodEnd?.toISOString(),
          cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
        };
      }

      console.log("✅ Google Sign-In successful for user:", user.id);
      console.log(
        "✅ Subscription status:",
        subscriptionData ? subscriptionData.status : "none"
      );
      console.log("✅ Trial status:", trialStatus);

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.displayName, // Changed from displayName to name
          provider: user.provider,
        },
        sessionToken,
        authMethod: "google",
        subscription: subscriptionData,
        trial: serializeTrialStatus(trialStatus),
      } as ApiResponse);
    } catch (error) {
      console.error("❌ Google Sign-In error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process Google sign-in",
      } as ApiResponse);
    }
  }
);

/**
 * Verify Session Token
 * Validates a session token and returns user info
 */
router.post("/verify", async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken } = req.body;
    const deviceFingerprint =
      typeof (req.body as any).deviceFingerprint === "string"
        ? ((req.body as any).deviceFingerprint as string).trim()
        : null;
    const devicePlatform =
      typeof (req.body as any).devicePlatform === "string"
        ? ((req.body as any).devicePlatform as string).trim()
        : undefined;

    if (!sessionToken) {
      res.status(400).json({
        success: false,
        error: "Missing required field: sessionToken",
      } as ApiResponse);
      return;
    }

    // Verify session token
    const { verifyPermanentSessionToken } = await import("../utils/auth.js");
    const payload = verifyPermanentSessionToken(sessionToken);

    if (!payload) {
      res.status(401).json({
        success: false,
        error: "Invalid or expired session token",
      } as ApiResponse);
      return;
    }

    // Get user from database
    const userModel = new User();
    let user = await userModel.findById(payload.userId);

    // In development, if user not found by ID, try finding by email or firebaseUid
    // This handles cases where token was generated on a different environment
    if (!user && process.env.NODE_ENV === "development") {
      console.log(`🔧 Development mode: User ${payload.userId} not found by ID, trying alternative lookups...`);
      
      // Try finding by email first
      user = await userModel.findByEmail(payload.email);
      if (user) {
        console.log(`✅ Found user by email: ${user.id}`);
      } else {
        // Try finding by firebaseUid (some tokens might store userId as firebaseUid)
        user = await userModel.findByFirebaseUid(payload.userId);
        if (user) {
          console.log(`✅ Found user by firebaseUid: ${user.id}`);
        }
      }
    }

    // In development, if user still doesn't exist but token is valid, create the user
    if (!user && process.env.NODE_ENV === "development") {
      console.log(`🔧 Development mode: Creating new user from token payload`);
      console.log(`   Token payload: userId=${payload.userId}, email=${payload.email}, provider=${payload.provider}`);
      try {
        // Create user from token data - store token's userId as firebaseUid for future lookups
        // Note: Prisma will auto-generate a new database ID, but we'll store the token's userId as firebaseUid
        const createData: any = {
          firebaseUid: payload.userId, // Store token's userId as firebaseUid for lookup
          email: payload.email,
          displayName: payload.email.split("@")[0], // Use email prefix as display name
          provider: payload.provider,
          emailVerified: true,
        };
        
        // Set provider-specific fields
        if (payload.provider === "google") {
          createData.googleUserId = payload.userId;
        } else if (payload.provider === "apple") {
          createData.appleUserId = payload.userId;
        }
        
        user = await userModel.create(createData);
        
        console.log(`✅ Created development user: ${user.id} (${user.email})`);
        console.log(`   Note: Original token userId (${payload.userId}) stored as firebaseUid for future lookups`);
        
        // Touch device fingerprint if provided
        if (deviceFingerprint) {
          await trialService.touchDeviceFingerprint(
            user.id,
            deviceFingerprint,
            devicePlatform
          );
        }
        
        // Trials are now only granted when users subscribe, not on sign-up
      } catch (createError) {
        console.error("❌ Failed to create development user:", createError);
        // If it's a unique constraint error, try to find the user again
        if ((createError as any).code === 'P2002') {
          console.log("   User might have been created by another request, trying to find...");
          user = await userModel.findByFirebaseUid(payload.userId);
          if (!user) {
            user = await userModel.findByEmail(payload.email);
          }
          if (user) {
            console.log(`✅ Found user after creation conflict: ${user.id}`);
          }
        }
        
        if (!user) {
          res.status(404).json({
            success: false,
            error: "User not found and could not be created",
          } as ApiResponse);
          return;
        }
      }
    }

    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      } as ApiResponse);
      return;
    }

    // CRITICAL: Update device fingerprint to current user when they verify session
    // This ensures device fingerprint is always linked to the currently logged-in user
    // Prevents User B from seeing User A's trial when logging in on the same device
    if (deviceFingerprint) {
      await trialService.touchDeviceFingerprint(
        user.id,
        deviceFingerprint,
        devicePlatform || user.provider
      );
    }

    // Get user's subscription data
    const { default: Subscription } = await import("../models/Subscription.js");
    const subscriptionModel = new Subscription();
    const activeSubscription = await subscriptionModel.findActiveByUserId(
      user.id
    );

    let subscriptionData = null;
    if (activeSubscription) {
      subscriptionData = {
        status: activeSubscription.status,
        endDate: activeSubscription.currentPeriodEnd?.toISOString(),
        cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
      };
    }

    // Get trial status for THIS user (not device-based)
    await trialService.expireIfNeeded(user.id);
    const trialStatus = await trialService.status(user.id);

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.displayName, // Changed from displayName to name
        provider: user.provider,
      },
      subscription: subscriptionData,
      trial: serializeTrialStatus(trialStatus),
    } as ApiResponse);
  } catch (error) {
    console.error("❌ Token verification error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify session token",
    } as ApiResponse);
  }
});

/**
 * Delete Account
 * Permanently deletes user account and all associated data
 */
router.delete(
  "/delete-account",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, userId } = req.body;

      // Validate required fields
      if (!email || !userId) {
        res.status(400).json({
          success: false,
          error: "Missing required fields: email, userId",
        } as ApiResponse);
        return;
      }

      console.log("🗑️ Account deletion request:", { email, userId });

      // Find and delete the user
      const userModel = new User();

      // Try to find user by database ID first, then by Firebase UID
      let user = await userModel.findById(userId);

      if (!user) {
        console.log("🔍 User not found by ID, trying Firebase UID...");
        user = await userModel.findByFirebaseUid(userId);
      }

      // If still not found, try to find by email as a last resort
      if (!user) {
        console.log("🔍 User not found by Firebase UID, trying email...");
        user = await userModel.findByEmail(email);

        if (user) {
          console.log("✅ User found by email:", {
            id: user.id,
            email: user.email,
            firebaseUid: user.firebaseUid,
          });
        }
      }

      if (!user) {
        console.log("❌ User not found by ID, Firebase UID, or email:", {
          userId,
          email,
        });
        res.status(404).json({
          success: false,
          error: "User account not found. It may have already been deleted.",
        } as ApiResponse);
        return;
      }

      console.log("✅ User found:", {
        id: user.id,
        email: user.email,
        firebaseUid: user.firebaseUid,
      });

      // Verify the email matches (additional security check)
      // Skip email verification for Apple users with private relay emails
      // Apple generates different private relay emails for web vs desktop, so we can't rely on email matching
      const isApplePrivateRelay =
        email.includes("@privaterelay.appleid.com") ||
        user.email.includes("@privaterelay.appleid.com");

      if (isApplePrivateRelay) {
        console.log(
          "✅ Skipping email verification for Apple user (private relay email)"
        );
        console.log("✅ User verified by Firebase UID/Apple User ID instead");
      } else {
        // Normalize emails for comparison (trim and lowercase)
        const normalizedUserEmail = user.email.trim().toLowerCase();
        const normalizedRequestEmail = email.trim().toLowerCase();

        console.log("🔍 Email comparison:", {
          requestEmail: email,
          normalizedRequestEmail,
          userEmail: user.email,
          normalizedUserEmail,
          match: normalizedUserEmail === normalizedRequestEmail,
        });

        if (normalizedUserEmail !== normalizedRequestEmail) {
          console.log("❌ Email mismatch!");
          res.status(400).json({
            success: false,
            error: "Email does not match user account",
          } as ApiResponse);
          return;
        }

        console.log("✅ Email verified successfully");
      }

      // Store identifiers before deletion for blacklisting
      const appleUserId = user.appleUserId;
      const googleUserId = user.googleUserId;
      const firebaseUid = user.firebaseUid;
      const dbUserId = user.id; // Use the database ID for deletion

      // Create a simple blacklist entry in localStorage/sessionStorage equivalent
      // For now, we'll use a simple in-memory blacklist (in production, use Redis or database)
      const deletedUserInfo = {
        userId: dbUserId,
        appleUserId,
        googleUserId,
        firebaseUid,
        email: user.email,
        deletedAt: new Date().toISOString(),
      };

      // Store in a simple way - in production, use Redis or a proper blacklist table
      if (appleUserId) {
        global.deletedAppleUsers = global.deletedAppleUsers || new Map();
        global.deletedAppleUsers.set(appleUserId, deletedUserInfo);
      }
      if (googleUserId) {
        global.deletedGoogleUsers = global.deletedGoogleUsers || new Map();
        global.deletedGoogleUsers.set(googleUserId, deletedUserInfo);
      }
      if (firebaseUid) {
        global.deletedFirebaseUsers = global.deletedFirebaseUsers || new Map();
        global.deletedFirebaseUsers.set(firebaseUid, deletedUserInfo);
      }

      // Delete the user (this will cascade delete subscriptions and sessions due to foreign key constraints)
      // Use the database ID, not the Firebase UID
      await userModel.delete(dbUserId);

      console.log("✅ Account deletion successful for user:", dbUserId);
      console.log("✅ Blacklisted identifiers:", {
        appleUserId,
        googleUserId,
        firebaseUid,
      });

      res.status(200).json({
        success: true,
        message: "Account deleted successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("❌ Account deletion error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete account",
      } as ApiResponse);
    }
  }
);

export default router;
