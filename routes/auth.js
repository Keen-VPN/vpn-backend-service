import express from 'express';
import { verifyFirebaseToken } from '../config/firebase.js';
import UserSupabase from '../models/UserSupabase.js';

const router = express.Router();

// Get current user profile
router.get('/profile', verifyFirebaseToken, async (req, res) => {
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
      user: {
        firebaseUid: user.firebase_uid,
        email: user.email,
        name: user.display_name,
        photoURL: req.user.picture,
        isSubscribed: hasActiveSubscription,
        subscriptionStatus: userWithSubscription?.subscription_status || 'inactive',
        currentPlan: userWithSubscription?.subscription_plan || null,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      subscription: {
        status: userWithSubscription?.subscription_status || 'inactive',
        plan: userWithSubscription?.subscription_plan || null,
        endDate: userWithSubscription?.subscription_end_date || null,
        customerId: userWithSubscription?.stripe_customer_id || null
      },
      hasActiveSubscription: hasActiveSubscription
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
});

// Update user profile
router.put('/profile', verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const { name, photoURL } = req.body;
    const userModel = new UserSupabase();

    // Find user
    const user = await userModel.findByFirebaseUid(firebaseUid);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.display_name = name;

    await userModel.updateUser(user.id, updateData);

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user profile'
    });
  }
});

// Check if user can access VPN (has active subscription)
router.get('/can-access-vpn', verifyFirebaseToken, async (req, res) => {
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
    
    if (hasActiveSubscription) {
      res.json({
        success: true,
        canAccess: true,
        message: 'User has active subscription'
      });
    } else {
      res.json({
        success: true,
        canAccess: false,
        message: 'User needs active subscription to access VPN',
        subscriptionRequired: true
      });
    }
  } catch (error) {
    console.error('Error checking VPN access:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check VPN access'
    });
  }
});

// Initialize user (called after successful authentication)
router.post('/init', verifyFirebaseToken, async (req, res) => {
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
      user: {
        firebaseUid: user.firebase_uid,
        email: user.email,
        name: user.display_name,
        photoURL: req.user.picture,
        isSubscribed: hasActiveSubscription,
        subscriptionStatus: userWithSubscription?.subscription_status || 'inactive',
        currentPlan: userWithSubscription?.subscription_plan || null
      },
      subscription: {
        status: userWithSubscription?.subscription_status || 'inactive',
        plan: userWithSubscription?.subscription_plan || null,
        endDate: userWithSubscription?.subscription_end_date || null,
        customerId: userWithSubscription?.stripe_customer_id || null
      },
      hasActiveSubscription: hasActiveSubscription
    });
  } catch (error) {
    console.error('Error initializing user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize user'
    });
  }
});

export default router; 