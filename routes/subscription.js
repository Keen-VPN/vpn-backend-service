import express from 'express';
import { verifyFirebaseToken } from '../config/firebase.js';
import { 
  createCustomerPortalSession
} from '../config/stripe.js';
import stripe from '../config/stripe.js';
import User from '../models/User.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Get available subscription plans (simplified for single plan)
router.get('/plans', async (req, res) => {
  try {
    // Get the plan details from environment variables or configuration
    const planPrice = process.env.PLAN_PRICE || 99.99;
    const planName = process.env.PLAN_NAME || 'Premium VPN';
    const planFeatures = process.env.PLAN_FEATURES ? 
      process.env.PLAN_FEATURES.split(',') : 
      ['Unlimited bandwidth', 'Global servers', 'Premium support'];
    const stripeCheckoutLink = process.env.STRIPE_CHECKOUT_LINK || 'https://buy.stripe.com/6oUbJ2fpScpUbhB4oaffy00';
    
    const plans = [{
      id: 'premium',
      name: planName,
      price: parseFloat(planPrice),
      period: 'year',
      features: planFeatures,
      checkoutLink: stripeCheckoutLink
    }];
    
    res.json({
      success: true,
      plans: plans
    });
  } catch (error) {
    console.error('Error getting plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription plans'
    });
  }
});

// Get user subscription status
router.get('/status', verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    
    // Create or update user from Firebase token data
    const user = await User.createOrUpdateUser(req.user);
    
    // Get subscription details
    const subscriptionDetails = await User.getSubscriptionDetails(firebaseUid);
    
    // Check if subscription is active
    const hasActiveSubscription = await User.hasActiveSubscription(firebaseUid);

    res.json({
      success: true,
      subscription: subscriptionDetails,
      hasActiveSubscription: hasActiveSubscription
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription status'
    });
  }
});

// Create customer portal session
router.post('/customer-portal', verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const { returnUrl } = req.body;

    // Get user
    const user = await User.getUserByFirebaseUid(firebaseUid);
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    // Create customer portal session
    const session = await createCustomerPortalSession(
      user.stripeCustomerId,
      returnUrl
    );

    res.json({
      success: true,
      url: session.url
    });
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create customer portal session'
    });
  }
});

// Create Stripe Checkout Session (backend-driven, secure)
router.post('/create-checkout-session', verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    
    // Create or update user from Firebase token data
    const user = await User.createOrUpdateUser(req.user);
    
    if (!user || !user.email) {
      return res.status(400).json({ success: false, error: 'User email required' });
    }
    
    // Get plan info
    const planPrice = process.env.PLAN_PRICE || 99.99;
    const planName = process.env.PLAN_NAME || 'Premium VPN';
    const stripePriceId = process.env.STRIPE_PRICE_ID; // You must set this in your .env
    if (!stripePriceId) {
      return res.status(500).json({ success: false, error: 'Stripe price ID not configured' });
    }
    
    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: user.email,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: process.env.CHECKOUT_SUCCESS_URL,
      cancel_url: process.env.CHECKOUT_CANCEL_URL,
      metadata: {
        firebaseUid: user.firebaseUid,
        plan: planName
      }
    });
    
    res.json({ success: true, url: session.url });
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    res.status(500).json({ success: false, error: 'Failed to create checkout session' });
  }
});

// Webhook endpoint for Stripe events
router.post('/webhook', async (req, res) => {
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

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
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
    
    // For static checkout link, we need to find the user by email
    // since we don't have the Firebase UID in the session metadata
    
    // Get customer details from Stripe
    const customer = await stripe.customers.retrieve(customerId);
    const userEmail = customer.email;
    
    // Find user by email
    const user = await User.getUserByEmail(userEmail);
    if (!user) {
      console.error('User not found for email:', userEmail);
      return;
    }

    // Check if subscription update should be allowed
    const shouldAllow = await User.shouldAllowSubscriptionUpdate(user.firebaseUid, status);
    if (!shouldAllow) {
      console.log(`Skipping subscription creation for user ${user.firebaseUid} - update not allowed`);
      return;
    }

    // Update user subscription status
    await User.updateSubscriptionStatus(user.firebaseUid, {
      status: status,
      planId: 'premium', // Single plan
      customerId: customerId,
      subscriptionId: subscriptionId,
      startDate: new Date(subscription.current_period_start * 1000),
      endDate: new Date(subscription.current_period_end * 1000)
    });

    console.log('Subscription created for user:', user.firebaseUid);
  } catch (error) {
    console.error('Error handling subscription created:', error);
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

    // Check if subscription update should be allowed
    const shouldAllow = await User.shouldAllowSubscriptionUpdate(user.firebaseUid, 'past_due');
    if (!shouldAllow) {
      console.log(`Skipping payment failed update for user ${user.firebaseUid} - update not allowed`);
      return;
    }

    // Update user subscription status to past_due
    await User.updateSubscriptionStatus(user.firebaseUid, {
      status: 'past_due',
      customerId: customerId,
      subscriptionId: invoice.subscription
    });

    console.log('Payment failed for user:', user.firebaseUid);
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

export default router; 