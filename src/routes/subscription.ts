import express, { Request, Response } from 'express';
import stripe from '../config/stripe.js';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import { verifyPermanentSessionToken } from '../utils/auth.js';
import type { ApiResponse } from '../types/index.js';

const router = express.Router();

// Get available subscription plans
router.get('/plans', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Updated to reflect single yearly plan at $100
    const planPrice = parseFloat(process.env.PLAN_PRICE || '100.00');
    const planName = process.env.PLAN_NAME || 'Premium VPN - Annual';
    const planFeatures = process.env.PLAN_FEATURES 
      ? process.env.PLAN_FEATURES.split(',')
      : ['Unlimited bandwidth', 'Global servers', 'Premium support', 'No logs policy'];
    const stripeCheckoutLink = process.env.STRIPE_CHECKOUT_LINK || '';

    const plans = [{
      id: 'premium_yearly',
      name: planName,
      price: planPrice,
      period: 'year',
      interval: 'year',
      features: planFeatures,
      checkoutLink: stripeCheckoutLink
    }];

    const response: ApiResponse = {
      success: true,
      data: { plans }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription plans'
    } as ApiResponse);
  }
});

// Get subscription status with permanent session token
router.post('/status-session', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      res.status(400).json({
        success: false,
        error: 'Session token is required'
      } as ApiResponse);
      return;
    }

    console.log('Getting subscription status with session token');

    // Verify the session token
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

    // Get user by ID
    const user = await userModel.findById(userInfo.userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      } as ApiResponse);
      return;
    }

    // Get active subscription from new subscriptions table
    const activeSubscription = await subscriptionModel.findActiveByUserId(user.id);

    // Check if subscription is active
    const hasActiveSubscription = activeSubscription !== null && activeSubscription.status === 'active';

    res.json({
      success: true,
      subscription: {
        status: activeSubscription?.status || 'inactive',
        plan: activeSubscription?.planName || '',
        endDate: activeSubscription?.currentPeriodEnd || '',
        customerId: activeSubscription?.stripeCustomerId || ''
      },
      hasActiveSubscription
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting subscription status with session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription status'
    } as ApiResponse);
  }
});

// Cancel subscription
router.post('/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken } = req.body;
    const authHeader = req.headers.authorization;

    let userInfo = null;

    // Try session token first
    if (sessionToken) {
      userInfo = verifyPermanentSessionToken(sessionToken);
    }

    // Try auth header if session token failed
    if (!userInfo && authHeader) {
      const token = authHeader.replace('Bearer ', '');
      userInfo = verifyPermanentSessionToken(token);
    }

    if (!userInfo) {
      res.status(401).json({
        success: false,
        error: 'No valid authentication token provided'
      } as ApiResponse);
      return;
    }

    const userModel = new User();
    const subscriptionModel = new Subscription();

    // Get user
    const user = await userModel.findById(userInfo.userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      } as ApiResponse);
      return;
    }

    // Get active subscription
    const activeSubscription = await subscriptionModel.findActiveByUserId(user.id);

    if (!activeSubscription) {
      res.status(404).json({
        success: false,
        error: 'No active subscription found'
      } as ApiResponse);
      return;
    }

    // Cancel subscription in Stripe
    if (activeSubscription.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(
          activeSubscription.stripeSubscriptionId,
          { cancel_at_period_end: true }
        );
        console.log('✅ Stripe subscription marked for cancellation');
      } catch (stripeError) {
        console.error('❌ Error cancelling Stripe subscription:', stripeError);
        // Continue with local cancellation even if Stripe fails
      }
    }

    // Cancel subscription in database
    const cancelledSubscription = await subscriptionModel.cancel(activeSubscription.id);

    res.json({
      success: true,
      message: 'Subscription auto-renewal cancelled. You will have access until the end of your billing period.',
      subscription: {
        status: 'active',  // Still active until period end
        cancelAtPeriodEnd: true,
        endDate: cancelledSubscription.currentPeriodEnd
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription'
    } as ApiResponse);
  }
});

// Create Stripe Checkout Session
router.post('/create-checkout-session', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      res.status(400).json({
        success: false,
        error: 'Session token is required'
      } as ApiResponse);
      return;
    }

    // Verify the session token
    const userInfo = verifyPermanentSessionToken(sessionToken);

    if (!userInfo) {
      res.status(401).json({
        success: false,
        error: 'Invalid session token'
      } as ApiResponse);
      return;
    }

    const userModel = new User();

    // Get user by ID from session token
    const user = await userModel.findById(userInfo.userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      } as ApiResponse);
      return;
    }

    if (!user.email) {
      res.status(400).json({ 
        success: false, 
        error: 'User email required' 
      } as ApiResponse);
      return;
    }

    // Get plan info
    const planName = process.env.PLAN_NAME || 'Premium VPN - Annual';
    const stripePriceId = process.env.STRIPE_PRICE_ID;

    if (!stripePriceId) {
      res.status(500).json({ 
        success: false, 
        error: 'Stripe price ID not configured' 
      } as ApiResponse);
      return;
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
      success_url: process.env.CHECKOUT_SUCCESS_URL!,
      cancel_url: process.env.CHECKOUT_CANCEL_URL!,
      metadata: {
        userId: user.id,
        plan: planName
      }
    });

    res.json({ 
      success: true, 
      url: session.url 
    } as ApiResponse);
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create checkout session' 
    } as ApiResponse);
  }
});

export default router;

