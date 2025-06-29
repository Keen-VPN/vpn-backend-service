import express from 'express';
import { verifyFirebaseToken } from '../config/firebase.js';
import { 
  createCustomerPortalSession
} from '../config/stripe.js';
import stripe from '../config/stripe.js';
import UserSupabase from '../models/UserSupabase.js';
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
    const userModel = new UserSupabase();
    
    // Get or create user
    let user = await userModel.findByFirebaseUid(firebaseUid);

    if (!user) {
      // Create new user
      user = await userModel.createUser({
        firebase_uid: firebaseUid,
        email: req.user.email,
        display_name: req.user.name || req.user.email
      });
    }
    
    // Get subscription details
    const userWithSubscription = await userModel.getUserWithSubscription(user.id);
    
    // Check if subscription is active
    const hasActiveSubscription = userWithSubscription?.subscription_status === 'active';

    res.json({
      success: true,
      subscription: {
        status: userWithSubscription?.subscription_status || 'inactive',
        plan: userWithSubscription?.subscription_plan || null,
        endDate: userWithSubscription?.subscription_end_date || null,
        customerId: userWithSubscription?.stripe_customer_id || null
      },
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
    const userModel = new UserSupabase();

    // Get user
    const user = await userModel.findByFirebaseUid(firebaseUid);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userWithSubscription = await userModel.getUserWithSubscription(user.id);
    if (!userWithSubscription?.stripe_customer_id) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    // Create customer portal session
    const session = await createCustomerPortalSession(
      userWithSubscription.stripe_customer_id,
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
    const userModel = new UserSupabase();

    // Get or create user
    let user = await userModel.findByFirebaseUid(firebaseUid);
    
    if (!user) {
      // Create new user
      user = await userModel.createUser({
        firebase_uid: firebaseUid,
        email: req.user.email,
        display_name: req.user.name || req.user.email
      });
    }
    
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
        firebaseUid: user.firebase_uid,
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