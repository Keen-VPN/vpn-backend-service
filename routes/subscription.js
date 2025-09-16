import express from 'express';
import { verifyFirebaseToken } from '../config/firebase.js';
import { 
  createCustomerPortalSession
} from '../config/stripe.js';
import stripe from '../config/stripe.js';
import UserSupabase from '../models/UserSupabase.js';
import { body, validationResult } from 'express-validator';
import fetch from 'node-fetch';

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

// Get subscription status with OAuth token (for Swift app)
router.post('/status-oauth', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'No token provided'
      });
    }
    
    console.log('Getting subscription status for Swift app');
    
    // Verify the Google OAuth token
    const googleUserInfo = await verifyGoogleOAuthToken(token);
    
    if (!googleUserInfo) {
      return res.status(401).json({
        success: false,
        error: 'Invalid OAuth token'
      });
    }
    
    const userModel = new UserSupabase();
    
    // Get user by Google user ID
    // First try to find by email (in case user was created with Firebase before)
    let user = await userModel.findByEmail(googleUserInfo.email);
    
    if (!user) {
      // Try to find by Firebase UID (using Google sub as firebase_uid)
      user = await userModel.findByFirebaseUid(googleUserInfo.sub);
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
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
    console.error('Error getting subscription status with OAuth:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription status'
    });
  }
  });
 
// Helper function to verify Google OAuth token (duplicate from auth.js)
async function verifyGoogleOAuthToken(token) {
  try {
    console.log('Attempting to verify Google OAuth token...');
    
    // First try as access token
    let response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`);
    
    if (!response.ok) {
      console.log(`Access token verification failed with status: ${response.status}`);
      
      // If access token fails, try as ID token
      response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
      
      if (!response.ok) {
        console.error(`ID token verification also failed with status: ${response.status}`);
        const errorText = await response.text();
        console.error('Google OAuth error response:', errorText);
        return null;
      }
    }
    
    const userInfo = await response.json();
    console.log('Google OAuth verification successful, user info:', {
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      email_verified: userInfo.email_verified
    });
    
    // Check if the token is valid and has the required fields
    if (!userInfo.email) {
      console.error('Google OAuth token missing email field');
      return null;
    }
    
    // For ID tokens, email_verified might not be present, so we'll be more lenient
    if (userInfo.email_verified === false) {
      console.error('Google OAuth token email not verified');
      return null;
    }
    
    return {
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      email_verified: userInfo.email_verified !== false
    };
  } catch (error) {
    console.error('Error verifying Google OAuth token:', error);
    return null;
  }
}

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

// Get subscription status with permanent session token
router.post('/status-session', async (req, res) => {
  try {
    const { sessionToken } = req.body;
    
    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'Session token is required'
      });
    }
    
    console.log('Getting subscription status with session token');
    
    // Verify the session token
    const jwt = require('jsonwebtoken');
    let userInfo;
    
    try {
      const decoded = jwt.verify(sessionToken, process.env.JWT_SECRET);
      
      if (decoded.type !== 'permanent') {
        return res.status(401).json({
          success: false,
          error: 'Invalid session token type'
        });
      }
      
      userInfo = {
        userId: decoded.userId,
        email: decoded.email
      };
    } catch (error) {
      console.error('Session token verification failed:', error);
      return res.status(401).json({
        success: false,
        error: 'Invalid session token'
      });
    }
    
    const userModel = new UserSupabase();
    
    // Get user by ID
    const user = await userModel.findById(userInfo.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
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
    console.error('Error getting subscription status with session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription status'
    });
  }
});

export default router; 