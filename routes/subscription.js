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

export default router; 