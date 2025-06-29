import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import database from '../config/database.js';
import authRoutes from '../routes/auth.js';
import subscriptionRoutes from '../routes/subscription.js';
import stripe from '../config/stripe.js';
import User from '../models/User.js';

console.log('Imports loaded successfully');
console.log('authRoutes type:', typeof authRoutes);
console.log('subscriptionRoutes type:', typeof subscriptionRoutes);

dotenv.config();

const app = express();

// Trust proxy for Netlify
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration for Netlify
// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [
      'https://vpnkeen.netlify.app',
      'https://vpnkeen.com',
      // Allow Electron app requests (file:// protocol)
      /^file:\/\//,
      // Allow localhost for Electron development
      /^http:\/\/localhost:\d+$/
    ]
    : [
      // Allow Electron app requests (file:// protocol)
      /^file:\/\//,
      // Allow localhost for Electron development
      /^http:\/\/localhost:\d+$/,
      // Allow all origins in development for easier testing
      true
    ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting with custom key generator
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    keyGenerator: (req) => {
        // Use X-Forwarded-For header or fallback to a default
        return req.headers['x-forwarded-for'] ||
            req.headers['client-ip'] ||
            req.ip ||
            req.connection.remoteAddress ||
            'unknown';
    },
    message: {
        error: 'Too many requests from this IP, please try again later.'
    },
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health';
    }
});
app.use('/', limiter);

// Webhook route needs raw body - must come BEFORE JSON parsing
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));

// Webhook handler for Stripe events
app.post('/api/subscription/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Set a timeout for the entire webhook processing
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Webhook processing timeout')), 8000); // 8 second timeout
    });

    const webhookPromise = (async () => {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object);
          break;

        case 'customer.subscription.created':
          await handleSubscriptionCreated(event.data.object);
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;

        case 'invoice.payment_succeeded':
          await handlePaymentSucceeded(event.data.object);
          break;

        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    })();

    // Race between webhook processing and timeout
    await Promise.race([webhookPromise, timeoutPromise]);

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);

    // If it's a timeout error, still return 200 to prevent Stripe retries
    if (error.message === 'Webhook processing timeout') {
      console.error('Webhook timed out, but returning 200 to prevent retries');
      return res.status(200).json({ received: true, warning: 'Processing timeout' });
    }

    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Webhook handlers
async function handleCheckoutSessionCompleted(session) {
  console.log('Checkout session completed:', session.id);
  // For static checkout link, we need to handle this differently
  // The subscription will be created automatically by Stripe
  // We'll handle it in the subscription.created event
}

async function handleSubscriptionCreated(subscription) {
  try {
    const customerId = subscription.customer;
    const subscriptionId = subscription.id;
    const status = subscription.status;

    // Set timeout for this operation (increased to 15 seconds)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Subscription creation timeout')), 15000);
    });

    const operationPromise = (async () => {
      console.log(`🔄 Processing subscription creation for customer: ${customerId}`);

      // Get customer details from Stripe
      console.log('📞 Fetching customer details from Stripe...');
      const customer = await stripe.customers.retrieve(customerId);
      const userEmail = customer.email;
      console.log(`📧 Found customer email: ${userEmail}`);

      // Find user by email
      console.log('🔍 Looking up user by email...');
      const user = await User.getUserByEmail(userEmail);
      if (!user) {
        console.error('❌ User not found for email:', userEmail);
        return;
      }
      console.log(`👤 Found user: ${user.firebaseUid}`);

      // Check if subscription update should be allowed
      console.log('✅ Checking if subscription update is allowed...');
      const shouldAllow = await User.shouldAllowSubscriptionUpdate(user.firebaseUid, status);
      if (!shouldAllow) {
        console.log(`⏭️ Skipping subscription creation for user ${user.firebaseUid} - update not allowed`);
        return;
      }

      // Update user subscription status
      console.log('💾 Updating user subscription status...');
      await User.updateSubscriptionStatus(user.firebaseUid, {
        status: status,
        planId: 'premium', // Single plan
        customerId: customerId,
        subscriptionId: subscriptionId,
        startDate: new Date(subscription.current_period_start * 1000),
        endDate: new Date(subscription.current_period_end * 1000)
      });

      console.log('✅ Subscription created for user:', user.firebaseUid);
    })();

    await Promise.race([operationPromise, timeoutPromise]);
  } catch (error) {
    console.error('❌ Error handling subscription created:', error);

    // Log more details for debugging
    if (error.message === 'Subscription creation timeout') {
      console.error('⏰ Subscription creation timed out after 15 seconds');
    } else {
      console.error('🔍 Error details:', {
        message: error.message,
        stack: error.stack,
        customerId: subscription?.customer,
        subscriptionId: subscription?.id
      });
    }
  }
}

async function handleSubscriptionUpdated(subscription) {
  try {
    const customerId = subscription.customer;
    const status = subscription.status;

    // Find user by Stripe customer ID
    const user = await User.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.error('User not found for customer:', customerId);
      return;
    }

    // Check if subscription update should be allowed
    const shouldAllow = await User.shouldAllowSubscriptionUpdate(user.firebaseUid, status);
    if (!shouldAllow) {
      console.log(`Skipping subscription update for user ${user.firebaseUid} - update not allowed`);
      return;
    }

    // Update user subscription status
    await User.updateSubscriptionStatus(user.firebaseUid, {
      status: status,
      planId: 'premium', // Single plan
      customerId: customerId,
      subscriptionId: subscription.id,
      startDate: new Date(subscription.current_period_start * 1000),
      endDate: new Date(subscription.current_period_end * 1000)
    });

    console.log('Subscription updated for user:', user.firebaseUid);
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

async function handleSubscriptionDeleted(subscription) {
  try {
    const customerId = subscription.customer;

    // Find user by Stripe customer ID
    const user = await User.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.error('User not found for customer:', customerId);
      return;
    }

    // Check if subscription update should be allowed
    const shouldAllow = await User.shouldAllowSubscriptionUpdate(user.firebaseUid, 'cancelled');
    if (!shouldAllow) {
      console.log(`Skipping subscription deletion for user ${user.firebaseUid} - update not allowed`);
      return;
    }

    // Update user subscription status to cancelled
    await User.updateSubscriptionStatus(user.firebaseUid, {
      status: 'cancelled',
      planId: null,
      customerId: customerId,
      subscriptionId: subscription.id,
      startDate: null,
      endDate: null
    });

    console.log('Subscription cancelled for user:', user.firebaseUid);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

async function handlePaymentSucceeded(invoice) {
  console.log('Payment succeeded for invoice:', invoice.id);
  // Payment success is handled by subscription events
}

async function handlePaymentFailed(invoice) {
  try {
    const customerId = invoice.customer;

    // Find user by Stripe customer ID
    const user = await User.getUserByStripeCustomerId(customerId);
    if (!user) {
      console.error('User not found for customer:', customerId);
      return;
    }

    console.log('Payment failed for user:', user.firebaseUid);
    // Handle payment failure logic here
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

// Body parsing middleware (for all other routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection middleware with caching
let dbConnectionPromise = null;
let lastConnectionTime = 0;
const CONNECTION_CACHE_DURATION = 30000; // 30 seconds

app.use(async (req, res, next) => {
    try {
      const now = Date.now();

      // Check if we need to connect
        if (!database.isConnected()) {
          console.log('🔄 Database not connected, connecting...');

          // Use cached connection if it's recent
          if (dbConnectionPromise && (now - lastConnectionTime) < CONNECTION_CACHE_DURATION) {
            console.log('⏳ Using cached connection promise...');
            await dbConnectionPromise;
          } else {
            // Create new connection
            dbConnectionPromise = database.connect();
            lastConnectionTime = now;
            await dbConnectionPromise;
          }
        } else {
          // Verify connection is still healthy
          const health = await database.healthCheck();
          if (health.status !== 'healthy') {
            console.log('⚠️ Database unhealthy, reconnecting...');
            await database.close();
            dbConnectionPromise = database.connect();
            lastConnectionTime = now;
            await dbConnectionPromise;
          }
        }
        next();
    } catch (error) {
      console.error('❌ Database connection error:', error);

      // Clear cached connection on error
      dbConnectionPromise = null;

      // For webhook requests, don't fail the request
      if (req.path === '/api/subscription/webhook') {
        console.log('⚠️ Database error in webhook, continuing without DB...');
        return next();
      }

        res.status(500).json({
            success: false,
            error: 'Database connection failed'
        });
    }
});

// API routes
console.log('Registering auth routes...');
app.use('/api/auth', authRoutes);
console.log('Registering subscription routes...');
app.use('/api/subscription', subscriptionRoutes);
console.log('Routes registered successfully');

// Debug route to test subscription router
app.get('/debug-subscription', (req, res) => {
  res.json({
    success: true,
    message: 'Subscription router is working',
    subscriptionRoutes: typeof subscriptionRoutes,
    authRoutes: typeof authRoutes
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        platform: 'netlify-functions'
    });
});

// Stripe checkout success page
app.get('/success', (req, res) => {
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
        <a href="keenvpn://success" class="btn">Return to App</a>
      </div>
    </body>
    </html>
  `);
});

// Stripe checkout cancel page
app.get('/cancel', (req, res) => {
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
        <a href="keenvpn://cancel" class="btn">Return to App</a>
      </div>
    </body>
    </html>
  `);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Catch-all logger for unmatched requests
app.use((req, res, next) => {
  console.log('Unmatched request path:', req.path);
  next();
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Export the serverless handler
export const handler = serverless(app); 