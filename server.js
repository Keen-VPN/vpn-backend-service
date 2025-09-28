import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { getInstance as getSupabaseInstance } from './config/supabase.js';
import authRoutes from './routes/auth.js';
import subscriptionRoutes from './routes/subscription.js';
import connectionRoutes from './routes/connection.js';
import stripe from './config/stripe.js';
import UserSupabase from './models/UserSupabase.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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
  }
});
app.use('/api/', limiter);

// Initialize Supabase
const supabase = getSupabaseInstance();

// Webhook route needs raw body - must come BEFORE JSON parsing
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));

// Webhook handler for Stripe events (local development)
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
      setTimeout(() => reject(new Error('Webhook processing timeout')), 8000);
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

        case 'invoice_payment.paid':
          await handleInvoicePaymentPaid(event.data.object);
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

// Webhook handlers (same as in functions/api.js)
async function handleCheckoutSessionCompleted(session) {
  console.log('Checkout session completed:', session.id);
}

async function handleSubscriptionCreated(subscription) {
  try {
    const customerId = subscription.customer;
    const status = subscription.status;

    console.log(`🔄 Processing subscription creation for customer: ${customerId}`);

    // Get customer details from Stripe
    const customer = await stripe.customers.retrieve(customerId);
    const userEmail = customer.email;
    console.log(`📧 Found customer email: ${userEmail}`);

    // Find user by email using Supabase
    const userSupabase = new UserSupabase();
    const user = await userSupabase.findByEmail(userEmail);
    if (!user) {
      console.error('❌ User not found for email:', userEmail);
      return;
    }
    console.log(`👤 Found user: ${user.firebase_uid}`);

    // For subscription.created, we only want to store the customer ID
    // but NOT activate the subscription yet (payment hasn't been processed)
    if (status === 'incomplete' || status === 'incomplete_expired') {
      console.log(`⏳ Subscription created but payment pending - storing customer ID only`);

      // Only update the customer ID, keep subscription status as inactive
      await userSupabase.updateUser(user.id, {
        stripe_customer_id: customerId
      });

      console.log('✅ Customer ID stored, waiting for payment confirmation');
      return;
    }

    // If somehow we get an active status immediately, process it normally
    const newEndDate = new Date(subscription.current_period_end * 1000).toISOString();
    const shouldAllow = await userSupabase.shouldAllowSubscriptionUpdate(user.id, status, newEndDate);

    if (!shouldAllow) {
      console.log(`⏭️ Skipping subscription creation for user ${user.firebase_uid} - update not allowed`);
      return;
    }

    // Update user subscription status
    await userSupabase.updateSubscriptionStatus(user.id, {
      customerId: customerId,
      plan: 'premium',
      endDate: newEndDate
    });

    console.log('✅ Subscription creation processed successfully');
  } catch (error) {
    console.error('❌ Error processing subscription creation:', error);
    throw error;
  }
}

async function handleSubscriptionUpdated(subscription) {
  try {
    const customerId = subscription.customer;
    const status = subscription.status;

    console.log(`🔄 Processing subscription update for customer: ${customerId}, status: ${status}`);

    const userSupabase = new UserSupabase();
    const user = await userSupabase.findByStripeCustomerId(customerId);

    if (!user) {
      console.error('❌ User not found for customer ID:', customerId);
      return;
    }

    // Check if subscription update should be allowed
    const newEndDate = new Date(subscription.current_period_end * 1000).toISOString();
    const shouldAllow = await userSupabase.shouldAllowSubscriptionUpdate(user.id, status, newEndDate);

    if (!shouldAllow) {
      console.log(`⏭️ Skipping subscription update for user ${user.firebase_uid} - update not allowed`);
      return;
    }

    // Special handling for when subscription becomes active (payment succeeded)
    if (status === 'active') {
      console.log(`🎉 Payment confirmed! Activating subscription for user ${user.firebase_uid}`);
    }

    await userSupabase.updateSubscriptionStatus(user.id, {
      customerId: customerId,
      status: status,
      plan: 'premium',
      endDate: newEndDate
    });

    console.log('✅ Subscription update processed successfully');
  } catch (error) {
    console.error('❌ Error processing subscription update:', error);
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription) {
  try {
    const customerId = subscription.customer;

    console.log(`🔄 Processing subscription deletion for customer: ${customerId}`);

    const userSupabase = new UserSupabase();
    const user = await userSupabase.findByStripeCustomerId(customerId);

    if (!user) {
      console.error('❌ User not found for customer ID:', customerId);
      return;
    }

    // Check if subscription update should be allowed
    const shouldAllow = await userSupabase.shouldAllowSubscriptionUpdate(user.id, 'cancelled', null);

    if (!shouldAllow) {
      console.log(`⏭️ Skipping subscription deletion for user ${user.firebase_uid} - update not allowed`);
      return;
    }

    await userSupabase.updateSubscriptionStatus(user.id, {
      customerId: customerId,
      status: 'cancelled',
      plan: null,
      endDate: new Date().toISOString()
    });

    console.log('✅ Subscription deletion processed successfully');
  } catch (error) {
    console.error('❌ Error processing subscription deletion:', error);
    throw error;
  }
}

async function handlePaymentSucceeded(invoice) {
  try {
    console.log(`💰 Payment succeeded for invoice: ${invoice.id}`);

    // If this is a subscription invoice, the subscription should be updated
    if (invoice.subscription) {
      console.log(`📋 This payment is for subscription: ${invoice.subscription}`);

      // Fetch the updated subscription to get the latest status
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      console.log(`📊 Subscription status after payment: ${subscription.status}`);

      // The subscription.updated webhook should handle the status change
      // but we can log it here for debugging
      if (subscription.status === 'active') {
        console.log(`✅ Subscription is now active after successful payment`);
      }
    }
  } catch (error) {
    console.error('❌ Error processing payment succeeded:', error);
  }
}

async function handlePaymentFailed(invoice) {
  console.log('Payment failed for invoice:', invoice.id);
}

async function handleInvoicePaymentPaid(invoicePayment) {
  try {
    console.log(`💰 Invoice payment paid: ${invoicePayment.id}`);
    
    // Get the invoice details to find the customer
    const invoice = await stripe.invoices.retrieve(invoicePayment.invoice);
    const customerId = invoice.customer;
    
    console.log(`🔄 Processing invoice payment for customer: ${customerId}`);
    
    // Find user by Stripe customer ID
    const userSupabase = new UserSupabase();
    const user = await userSupabase.findByStripeCustomerId(customerId);
    
    if (!user) {
      console.error('❌ User not found for customer ID:', customerId);
      return;
    }
    
    console.log(`👤 Found user: ${user.firebase_uid}`);
    
    // If this is a subscription invoice, activate the subscription
    if (invoice.subscription) {
      console.log(`📋 This payment is for subscription: ${invoice.subscription}`);
      
      // Get the subscription details
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      const status = subscription.status;
      const endDate = new Date(subscription.current_period_end * 1000).toISOString();
      
      console.log(`📊 Subscription status: ${status}, end date: ${endDate}`);
      
      // Check if subscription update should be allowed
      const shouldAllow = await userSupabase.shouldAllowSubscriptionUpdate(user.id, status, endDate);
      
      if (!shouldAllow) {
        console.log(`⏭️ Skipping subscription activation for user ${user.firebase_uid} - update not allowed`);
        return;
      }
      
      // Activate the subscription
      if (status === 'active') {
        console.log(`🎉 Payment confirmed! Activating subscription for user ${user.firebase_uid}`);
        
        await userSupabase.updateSubscriptionStatus(user.id, {
          customerId: customerId,
          status: 'active',
          plan: 'premium',
          endDate: endDate
        });
        
        console.log('✅ Subscription activated successfully after invoice payment');
      }
    } else {
      console.log('📄 This is a one-time payment, not a subscription');
    }
    
  } catch (error) {
    console.error('❌ Error processing invoice payment paid:', error);
    throw error;
  }
}

// Body parsing middleware (for all other routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/connection', connectionRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const startTime = Date.now();

    // Check Supabase connection
    const dbHealth = await supabase.healthCheck();

    const totalResponseTime = Date.now() - startTime;

    const healthData = {
      status: dbHealth.status === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: {
          status: dbHealth.status,
          responseTime: dbHealth.responseTime,
          error: dbHealth.error || null
        }
      },
      responseTime: totalResponseTime
    };

    const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthData);

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
        <a href="vpnkeen://success" class="btn">Return to App</a>
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
        <a href="vpnkeen://cancel" class="btn">Return to App</a>
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

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Start server
async function startServer() {
  try {
    // Initialize Supabase
    console.log('🔄 Initializing Supabase...');
    supabase.init();
    console.log('✅ Supabase initialized successfully');
    
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
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer(); 