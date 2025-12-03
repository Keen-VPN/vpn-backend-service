import dotenv from "dotenv";

// Load environment variables FIRST before any other imports
dotenv.config();

import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import subscriptionRoutes from "./routes/subscription.js";
import subscriptionHistoryRoutes from "./routes/subscription-history.js";
import connectionRoutes from "./routes/connection.js";
import desktopAuthRoutes from "./routes/desktop-auth.js";
import appleIAPRoutes from "./routes/apple-iap.js";
import notificationsRoutes from "./routes/notifications.js";
import configRoutes from "./routes/config.js";
import salesContactRoutes from "./routes/sales-contact.js";
import userPreferencesRoutes from "./routes/user-preferences.js";
import stripe from "./config/stripe.js";
import "./config/firebase.js"; // Initialize Firebase
import User from "./models/User.js";
import Subscription from "./models/Subscription.js";
import prisma from "./config/prisma.js";
import CronJobService from "./services/cronService.js";
import SessionProcessingService from "./services/sessionProcessing.js";
import type Stripe from "stripe";
import { createTunnelManager } from "./utils/tunnel.js";
import TrialService from "./services/TrialService.js";
import { requirePaidOrTrial } from "./middleware/requirePaidOrTrial.js";
import { serializeTrialStatus } from "./utils/trial.js";

const app: Express = express();
const PORT = parseInt(process.env.PORT || "3001", 10);
const trialService = new TrialService();

// Initialize tunnel manager
const tunnelManager = createTunnelManager();
let cronServiceInstance: CronJobService | null = null;

// Trust proxy for local tunnel
if (tunnelManager.getConfig().enabled) {
  app.set("trust proxy", 1);
}

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? [
            "https://vpnkeen.netlify.app",
            "https://vpnkeen.com",
            // Allow Electron app requests (file:// protocol)
            /^file:\/\//,
            // Allow localhost for Electron development
            /^http:\/\/localhost:\d+$/,
          ]
        : [
            // Allow Electron app requests (file:// protocol)
            /^file:\/\//,
            // Allow localhost for Electron development
            /^http:\/\/localhost:\d+$/,
            // Allow all origins in development for easier testing
            true,
          ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  // Configure for serverless environments (Netlify Functions)
  keyGenerator: (req): string => {
    // Use X-Forwarded-For header in serverless environments
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const ip = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded.split(",")[0];
      return ip || "unknown";
    }
    return req.ip || "unknown";
  },
  skip: (req) => {
    // Skip rate limiting in development or if no IP can be determined
    return process.env.NODE_ENV === "development" || !req.ip;
  },
});

// Only apply rate limiting in non-serverless environments
if (process.env.NETLIFY !== "true") {
  app.use("/api/", limiter);
}

// Webhook route needs raw body - must come BEFORE JSON parsing
app.use("/api/subscription/webhook", express.raw({ type: "application/json" }));

// Webhook handler for Stripe events
app.post(
  "/api/subscription/webhook",
  async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !endpointSecret) {
      res.status(400).send("Webhook Error: Missing signature or secret");
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      const error = err as Error;
      console.error("Webhook signature verification failed:", error.message);
      res.status(400).send(`Webhook Error: ${error.message}`);
      return;
    }

    try {
      // Set a timeout for the entire webhook processing
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Webhook processing timeout")), 8000);
      });

      const webhookPromise = (async () => {
        switch (event.type) {
          case "checkout.session.completed":
            await handleCheckoutSessionCompleted(
              event.data.object as Stripe.Checkout.Session
            );
            break;

          case "customer.subscription.created":
            await handleSubscriptionCreatedOrUpdated(
              event.data.object as Stripe.Subscription
            );
            break;

          case "customer.subscription.updated":
            await handleSubscriptionCreatedOrUpdated(
              event.data.object as Stripe.Subscription
            );
            break;

          case "customer.subscription.deleted":
            await handleSubscriptionCancelled(
              event.data.object as Stripe.Subscription
            );
            break;

          default:
            console.log(`Unhandled event type: ${event.type}`);
        }
      })();

      // Race between webhook processing and timeout
      await Promise.race([webhookPromise, timeoutPromise]);

      res.json({ received: true });
    } catch (error) {
      const err = error as Error;
      console.error("Error handling webhook:", err);

      // If it's a timeout error, still return 200 to prevent Stripe retries
      if (err.message === "Webhook processing timeout") {
        console.error(
          "Webhook timed out, but returning 200 to prevent retries"
        );
        res.status(200).json({ received: true, warning: "Processing timeout" });
        return;
      }

      res.status(500).json({ error: "Webhook handler failed" });
    }
  }
);

// Helper function to extract plan information from Stripe subscription
function extractPlanInfo(subscription: Stripe.Subscription): {
  planId: string | null;
  planName: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  billingPeriod: "year" | "month" | null;
} {
  const items = subscription.items.data;
  if (!items || items.length === 0) {
    return {
      planId: null,
      planName: null,
      priceAmount: null,
      priceCurrency: null,
      billingPeriod: null,
    };
  }

  // Get the first item (most subscriptions have one item)
  const item = items[0];
  if (!item) {
    return {
      planId: null,
      planName: null,
      priceAmount: null,
      priceCurrency: null,
      billingPeriod: null,
    };
  }

  const price = item.price;

  if (!price) {
    return {
      planId: null,
      planName: null,
      priceAmount: null,
      priceCurrency: null,
      billingPeriod: null,
    };
  }

  // Extract billing period from interval
  const billingPeriod =
    price.recurring?.interval === "year"
      ? "year"
      : price.recurring?.interval === "month"
      ? "month"
      : null;

  // Extract plan name from product or price nickname
  const planName = price.nickname || price.product?.toString() || "Premium VPN";

  return {
    planId: price.id || null,
    planName,
    priceAmount: price.unit_amount ? price.unit_amount / 100 : null, // Convert cents to dollars
    priceCurrency: price.currency || "USD",
    billingPeriod,
  };
}

// Webhook handlers
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  try {
    console.log(`🔄 Processing checkout session completed: ${session.id}`);

    if (!session.subscription || typeof session.subscription !== "string") {
      console.log("ℹ️ Checkout session has no subscription (one-time payment)");
      return;
    }

    // Retrieve the subscription to get full details
    const subscription = await stripe.subscriptions.retrieve(
      session.subscription as string
    );

    // Process the subscription creation
    await handleSubscriptionCreatedOrUpdated(subscription);
  } catch (error) {
    console.error("❌ Error processing checkout session completed:", error);
    throw error;
  }
}

/**
 * Create subscription - always creates a new record to track subscription history
 * Handles: new subscriptions, subscription renewals (new billing periods), multiple subscriptions
 */
async function handleSubscriptionCreatedOrUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  try {
    const customerId = subscription.customer as string;

    console.log(
      `🔄 Processing subscription for customer: ${customerId}, subscription: ${subscription.id}`
    );

    // Get customer details from Stripe
    const customer = (await stripe.customers.retrieve(
      customerId
    )) as Stripe.Customer;
    const userEmail = customer.email;

    if (!userEmail) {
      console.error("❌ Customer has no email");
      return;
    }

    console.log(`📧 Found customer email: ${userEmail}`);

    // Find user by email
    const userModel = new User();
    const user = await userModel.findByEmail(userEmail);
    if (!user) {
      console.error("❌ User not found for email:", userEmail);
      return;
    }
    console.log(`👤 Found user: ${user.id}`);

    // Extract plan information from subscription
    const planInfo = extractPlanInfo(subscription);
    console.log(`📦 Plan info extracted:`, planInfo);

    // Map Stripe status to our status (Stripe uses "canceled", we use "cancelled")
    const mappedStatus =
      subscription.status === "canceled" ? "cancelled" : subscription.status;

    const subscriptionModel = new Subscription();
    const currentPeriodStart = new Date(
      subscription.current_period_start * 1000
    );
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

    // Check if we already have a subscription record for this Stripe subscription ID
    // and current billing period (to avoid duplicates from webhook retries)
    // The composite unique constraint (stripeSubscriptionId, currentPeriodStart) prevents duplicates
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscription.id,
        currentPeriodStart: currentPeriodStart,
      },
    });

    if (existingSubscription) {
      // Same billing period - this is likely a webhook retry or minor update
      // Update the existing record to reflect current status
      console.log(
        `ℹ️ Subscription with same billing period exists, updating status: ${existingSubscription.id}`
      );
      await subscriptionModel.update(existingSubscription.id, {
        subscriptionType: "stripe",
        status: mappedStatus as
          | "active"
          | "inactive"
          | "cancelled"
          | "past_due"
          | "trialing",
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        // Don't update period dates as they're the same
      });

      // If cancel_at_period_end is set, mark subscription for cancellation
      if (
        subscription.cancel_at_period_end &&
        !existingSubscription.cancelAtPeriodEnd
      ) {
        await subscriptionModel.cancel(existingSubscription.id);
        console.log(
          `🚫 Subscription marked for cancellation at period end: ${existingSubscription.id}`
        );
      }
      return;
    } else {
      // Different billing period or new subscription - create a new subscription record
      // This handles: new subscriptions, subscription renewals, multiple subscriptions per user
      console.log(
        `🔄 Creating new subscription record (new subscription or new billing period)`
      );
    }

    // Create new subscription record
    // This handles: new subscriptions, subscription renewals, multiple subscriptions per user
    await subscriptionModel.create({
      userId: user.id,
      subscriptionType: "stripe",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      status: mappedStatus as
        | "active"
        | "inactive"
        | "cancelled"
        | "past_due"
        | "trialing",
      planId: planInfo.planId || undefined,
      planName: planInfo.planName || undefined,
      priceAmount: planInfo.priceAmount || undefined,
      priceCurrency: planInfo.priceCurrency || "USD",
      billingPeriod: planInfo.billingPeriod || undefined,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    });

    console.log(
      `✅ Created new subscription record for user: ${user.id}, Stripe subscription: ${subscription.id}`
    );

    // Grant trial if user is eligible (trials only granted when subscribing, one-time only)
    // The trial service's existingGrant check ensures trials are only granted once per user
    try {
      const fullUser = await userModel.findById(user.id);
      if (fullUser) {
        const trialResult = await trialService.grantIfEligible(fullUser, null);
        if (trialResult.granted) {
          console.log("✅ Trial granted on Stripe subscription:", {
            userId: trialResult.userId,
            trialEndsAt: trialResult.trialEndsAt?.toISOString(),
          });
        } else {
          console.log(
            "ℹ️ Trial not granted (may already have one or not eligible):",
            {
              userId: trialResult.userId,
              reason: trialResult.reason,
            }
          );
        }
      }
    } catch (trialError) {
      // Don't fail subscription creation if trial grant fails
      console.warn(
        "⚠️ Failed to grant trial on Stripe subscription (non-fatal):",
        trialError
      );
    }

    // If cancel_at_period_end is set, mark the new subscription for cancellation
    if (subscription.cancel_at_period_end) {
      const newSubscription =
        await subscriptionModel.findByStripeSubscriptionId(subscription.id);
      if (
        newSubscription &&
        newSubscription.currentPeriodStart?.getTime() ===
          currentPeriodStart.getTime()
      ) {
        await subscriptionModel.cancel(newSubscription.id);
        console.log(
          `🚫 New subscription marked for cancellation at period end: ${newSubscription.id}`
        );
      }
    }

    console.log("✅ Subscription processed successfully");
  } catch (error) {
    console.error("❌ Error processing subscription:", error);
    throw error;
  }
}

/**
 * Cancel subscription - handles subscription deletion
 */
async function handleSubscriptionCancelled(
  subscription: Stripe.Subscription
): Promise<void> {
  try {
    console.log(`🔄 Processing subscription cancellation: ${subscription.id}`);

    const subscriptionModel = new Subscription();
    const existingSubscription =
      await subscriptionModel.findByStripeSubscriptionId(subscription.id);

    if (!existingSubscription) {
      console.error("❌ Subscription not found:", subscription.id);
      return;
    }

    // Mark subscription as cancelled and set cancelledAt timestamp
    await subscriptionModel.update(existingSubscription.id, {
      subscriptionType: "stripe",
      status: "cancelled",
      cancelledAt: new Date(),
      cancelAtPeriodEnd: false, // Already cancelled, so no longer scheduled for cancellation
    });

    console.log("✅ Subscription cancellation processed successfully");
  } catch (error) {
    console.error("❌ Error processing subscription cancellation:", error);
    throw error;
  }
}

// Body parsing middleware (for all other routes)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/subscription", subscriptionHistoryRoutes);
app.use("/api/connection", connectionRoutes);
app.use("/api/desktop-auth", desktopAuthRoutes);
app.use("/api/apple-iap", appleIAPRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/config", configRoutes);
app.use("/api/v1/user/preferences", userPreferencesRoutes);

app.get(
  "/api/me/subscription",
  requirePaidOrTrial,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).authUserId as string;
      const trialStatus =
        ((req as any).trialStatus as Awaited<
          ReturnType<TrialService["status"]>
        > | null) || (await trialService.status(userId));

      const subscriptionModel = new Subscription();
      const activeSubscription = await subscriptionModel.findActiveByUserId(
        userId
      );

      res.json({
        success: true,
        data: {
          userId,
          trial: serializeTrialStatus(trialStatus),
          subscription: activeSubscription
            ? {
                id: activeSubscription.id,
                status: activeSubscription.status,
                planName: activeSubscription.planName,
                currentPeriodEnd:
                  activeSubscription.currentPeriodEnd?.toISOString() ?? null,
                cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
                subscriptionType: activeSubscription.subscriptionType,
              }
            : null,
        },
      });
    } catch (error) {
      console.error("❌ Failed to fetch subscription summary:", error);
      res.status(500).json({
        success: false,
        error: "Failed to load subscription summary",
      });
    }
  }
);

// Manual session processing endpoint (for admin/testing)
app.post(
  "/api/admin/process-sessions",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { hoursBack } = req.body;
      const sessionProcessingService = new SessionProcessingService();

      console.log("🔄 Manual session processing triggered via API");

      let stats;
      if (hoursBack && typeof hoursBack === "number") {
        console.log(`📊 Processing sessions from last ${hoursBack} hours`);
        stats = await sessionProcessingService.processRecentSessions(hoursBack);
      } else {
        console.log("📊 Processing all unprocessed sessions");
        stats = await sessionProcessingService.processAllUnprocessedSessions();
      }

      res.json({
        success: true,
        message: "Session processing completed",
        stats,
      });
    } catch (error) {
      console.error("❌ Error in manual session processing:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process sessions",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);
app.use("/api/sales-contact", salesContactRoutes);

// Health check endpoint
async function sendHealthResponse(res: Response): Promise<void> {
  try {
    const healthData = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      services: {
        database: {
          status: "healthy",
        },
      },
    };

    res.status(200).json(healthData);
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: "Internal server error during health check",
    });
  }
}

app.get("/health", async (_req: Request, res: Response): Promise<void> => {
  await sendHealthResponse(res);
});

// Compatibility alias for clients that prefix the API base path.
app.get("/api/health", async (_req: Request, res: Response): Promise<void> => {
  await sendHealthResponse(res);
});

// Stripe checkout success page
app.get("/success", (_req: Request, res: Response): void => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Successful - KeenVPN</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          margin: 0; 
          padding: 0; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          min-height: 100vh; 
          color: white; 
        }
        .container { 
          text-align: center; 
          background: rgba(255,255,255,0.1); 
          padding: 40px; 
          border-radius: 20px; 
          backdrop-filter: blur(10px); 
          box-shadow: 0 8px 32px rgba(0,0,0,0.1); 
        }
        h1 { margin-bottom: 20px; font-size: 2.5em; }
        p { margin-bottom: 30px; font-size: 1.2em; opacity: 0.9; }
        .btn { 
          background: rgba(255,255,255,0.2); 
          color: white; 
          padding: 15px 30px; 
          border: none; 
          border-radius: 10px; 
          font-size: 1.1em; 
          cursor: pointer; 
          text-decoration: none; 
          display: inline-block; 
          transition: all 0.3s ease; 
        }
        .btn:hover { 
          background: rgba(255,255,255,0.3); 
          transform: translateY(-2px); 
        }
        .icon { font-size: 4em; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✅</div>
        <h1>Payment Successful!</h1>
        <p>Your KeenVPN subscription has been activated. You can now close this window and return to the app.</p>
        <a href="vpnkeen://success" class="btn">Return to App</a>
      </div>
    </body>
    </html>
  `);
});

// Stripe checkout cancel page
app.get("/cancel", (_req: Request, res: Response): void => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Cancelled - KeenVPN</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
          margin: 0; 
          padding: 0; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          min-height: 100vh; 
          color: white; 
        }
        .container { 
          text-align: center; 
          background: rgba(255,255,255,0.1); 
          padding: 40px; 
          border-radius: 20px; 
          backdrop-filter: blur(10px); 
          box-shadow: 0 8px 32px rgba(0,0,0,0.1); 
        }
        h1 { margin-bottom: 20px; font-size: 2.5em; }
        p { margin-bottom: 30px; font-size: 1.2em; opacity: 0.9; }
        .btn { 
          background: rgba(255,255,255,0.2); 
          color: white; 
          padding: 15px 30px; 
          border: none; 
          border-radius: 10px; 
          font-size: 1.1em; 
          cursor: pointer; 
          text-decoration: none; 
          display: inline-block; 
          transition: all 0.3s ease; 
        }
        .btn:hover { 
          background: rgba(255,255,255,0.3); 
          transform: translateY(-2px); 
        }
        .icon { font-size: 4em; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">❌</div>
        <h1>Payment Cancelled</h1>
        <p>Your payment was cancelled. You can try again anytime from the app.</p>
        <a href="vpnkeen://cancel" class="btn">Return to App</a>
      </div>
    </body>
    </html>
  `);
});

// Error handling middleware
app.use(
  (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Something went wrong",
    });
  }
);

// 404 handler
app.use("*", (_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// Start server
async function startServer(): Promise<void> {
  try {
    console.log("🔄 Initializing server...");

    // Initialize cron job service
    cronServiceInstance = new CronJobService();

    // Start session processing cron job
    // Default: daily at 2 AM UTC, or use SESSION_PROCESSING_CRON env variable
    const cronExpression = CronJobService.parseCronExpression(
      process.env.SESSION_PROCESSING_CRON || "0 2 * * *"
    );

    console.log(`📅 Session processing cron schedule: ${cronExpression}`);
    cronServiceInstance.startSessionProcessingJob(
      cronExpression,
      "session-processing"
    );

    // Start tunnelto.dev tunnel if enabled
    let tunnelUrl: string | null = null;
    if (tunnelManager.getConfig().enabled) {
      try {
        tunnelUrl = await tunnelManager.start();
      } catch (error) {
        console.error("⚠️ Failed to start tunnel (continuing without):", error);
      }
    }

    // Start Express server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🌐 Local network: http://0.0.0.0:${PORT}`);

      if (tunnelUrl) {
        console.log(`🌍 Public tunnel: ${tunnelUrl}`);
        console.log(`📡 Webhook URL: ${tunnelUrl}/api/subscription/webhook`);
      } else if (tunnelManager.getConfig().enabled) {
        console.log(
          `🔧 Tunnel enabled but failed to start. Run: ./scripts/setup-tunnel.sh`
        );
      }

      console.log("");
      console.log("🛠️  Development URLs:");
      console.log(`   Local:  http://localhost:${PORT}`);
      if (tunnelUrl) {
        console.log(`   Tunnel: ${tunnelUrl}`);
      }
      console.log("");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
const handleShutdown = (signal: NodeJS.Signals): void => {
  console.log(`🛑 ${signal} received, shutting down gracefully`);

  try {
    if (cronServiceInstance) {
      cronServiceInstance.stopAll();
      cronServiceInstance = null;
    }
  } catch (error) {
    console.error("⚠️ Failed to stop cron jobs:", error);
  }

  tunnelManager.stop();
  process.exit(0);
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (err: Error) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

process.on(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
  }
);

// Export app for serverless deployment (Netlify Functions)
export { app };

// Only start server if not in serverless or test environment
if (process.env.NETLIFY !== "true" && process.env.NODE_ENV !== "test") {
  startServer();
}
