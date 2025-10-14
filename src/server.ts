import dotenv from 'dotenv';

// Load environment variables FIRST before any other imports
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import subscriptionRoutes from './routes/subscription.js';
import connectionRoutes from './routes/connection.js';
import desktopAuthRoutes from './routes/desktop-auth.js';
import appleIAPRoutes from './routes/apple-iap.js';
import stripe from './config/stripe.js';
import './config/firebase.js'; // Initialize Firebase
import User from './models/User.js';
import Subscription from './models/Subscription.js';
import type Stripe from 'stripe';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Trust proxy for local tunnel
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  // Configure for serverless environments (Netlify Functions)
  keyGenerator: (req): string => {
    // Use X-Forwarded-For header in serverless environments
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ip || 'unknown';
    }
    return req.ip || 'unknown';
  },
  skip: (req) => {
    // Skip rate limiting in development or if no IP can be determined
    return process.env.NODE_ENV === 'development' || !req.ip;
  }
});

// Only apply rate limiting in non-serverless environments
if (process.env.NETLIFY !== 'true') {
  app.use('/api/', limiter);
}

// Webhook route needs raw body - must come BEFORE JSON parsing
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));

// Webhook handler for Stripe events
app.post('/api/subscription/webhook', async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !endpointSecret) {
    res.status(400).send('Webhook Error: Missing signature or secret');
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    const error = err as Error;
    console.error('Webhook signature verification failed:', error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  try {
    // Set a timeout for the entire webhook processing
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Webhook processing timeout')), 8000);
    });

    const webhookPromise = (async () => {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'customer.subscription.created':
          await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
          await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object as Stripe.Invoice);
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
    console.error('Error handling webhook:', err);

    // If it's a timeout error, still return 200 to prevent Stripe retries
    if (err.message === 'Webhook processing timeout') {
      console.error('Webhook timed out, but returning 200 to prevent retries');
      res.status(200).json({ received: true, warning: 'Processing timeout' });
      return;
    }

    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Webhook handlers
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  console.log('Checkout session completed:', session.id);
  // Implementation here
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
  try {
    const customerId = subscription.customer as string;

    console.log(`🔄 Processing subscription creation for customer: ${customerId}`);

    // Get customer details from Stripe
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    const userEmail = customer.email;
    
    if (!userEmail) {
      console.error('❌ Customer has no email');
      return;
    }

    console.log(`📧 Found customer email: ${userEmail}`);

    // Find user by email
    const userModel = new User();
    const user = await userModel.findByEmail(userEmail);
    if (!user) {
      console.error('❌ User not found for email:', userEmail);
      return;
    }
    console.log(`👤 Found user: ${user.id}`);

    // Create or update subscription
    const subscriptionModel = new Subscription();
    const existingSubscription = await subscriptionModel.findByStripeSubscriptionId(subscription.id);
    
    // Map Stripe status to our status (Stripe uses "canceled", we use "cancelled")
    const mappedStatus = subscription.status === 'canceled' ? 'cancelled' : subscription.status;

    if (existingSubscription) {
      await subscriptionModel.update(existingSubscription.id, {
        status: mappedStatus as 'active' | 'inactive' | 'cancelled' | 'past_due' | 'trialing',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000)
      });
    } else {
      await subscriptionModel.create({
        userId: user.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        status: mappedStatus as 'active' | 'inactive' | 'cancelled' | 'past_due' | 'trialing',
        planId: 'premium_yearly',
        planName: 'Premium VPN - Annual',
        priceAmount: 100.00,
        priceCurrency: 'USD',
        billingPeriod: 'year',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000)
      });
    }

    console.log('✅ Subscription creation processed successfully');
  } catch (error) {
    console.error('❌ Error processing subscription creation:', error);
    throw error;
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  try {
    const customerId = subscription.customer as string;
    const mappedStatus = subscription.status === 'canceled' ? 'cancelled' : subscription.status;

    console.log(`🔄 Processing subscription update for customer: ${customerId}, status: ${mappedStatus}`);

    const subscriptionModel = new Subscription();
    const existingSubscription = await subscriptionModel.findByStripeSubscriptionId(subscription.id);

    if (!existingSubscription) {
      console.error('❌ Subscription not found:', subscription.id);
      return;
    }

    await subscriptionModel.update(existingSubscription.id, {
      status: mappedStatus as 'active' | 'inactive' | 'cancelled' | 'past_due' | 'trialing',
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });

    console.log('✅ Subscription update processed successfully');
  } catch (error) {
    console.error('❌ Error processing subscription update:', error);
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  try {
    const customerId = subscription.customer as string;

    console.log(`🔄 Processing subscription deletion for customer: ${customerId}`);

    const subscriptionModel = new Subscription();
    const existingSubscription = await subscriptionModel.findByStripeSubscriptionId(subscription.id);

    if (!existingSubscription) {
      console.error('❌ Subscription not found:', subscription.id);
      return;
    }

    await subscriptionModel.update(existingSubscription.id, {
      status: 'cancelled',
      cancelledAt: new Date()
    });

    console.log('✅ Subscription deletion processed successfully');
  } catch (error) {
    console.error('❌ Error processing subscription deletion:', error);
    throw error;
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  try {
    console.log(`💰 Payment succeeded for invoice: ${invoice.id}`);

    if (invoice.subscription) {
      console.log(`📋 This payment is for subscription: ${invoice.subscription}`);
      
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
      console.log(`📊 Subscription status after payment: ${subscription.status}`);

      if (subscription.status === 'active') {
        console.log(`✅ Subscription is now active after successful payment`);
      }
    }
  } catch (error) {
    console.error('❌ Error processing payment succeeded:', error);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  console.log('Payment failed for invoice:', invoice.id);
}

// Body parsing middleware (for all other routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/connection', connectionRoutes);
app.use('/api/desktop-auth', desktopAuthRoutes);
app.use('/api/apple-iap', appleIAPRoutes);

// Health check endpoint
app.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: {
          status: 'healthy'
        }
      }
    };

    res.status(200).json(healthData);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Internal server error during health check'
    });
  }
});

// Stripe checkout success page
app.get('/success', (_req: Request, res: Response): void => {
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
app.get('/cancel', (_req: Request, res: Response): void => {
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
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Start server
async function startServer(): Promise<void> {
  try {
    console.log('🔄 Initializing server...');
    
    // Start Express server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🌐 Network access: http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Export app for serverless deployment (Netlify Functions)
export { app };

// Only start server if not in serverless environment
if (process.env.NETLIFY !== 'true') {
  startServer();
}

