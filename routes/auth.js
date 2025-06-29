import express from 'express';
import { verifyFirebaseToken } from '../config/firebase.js';
import User from '../models/User.js';

const router = express.Router();

// Get current user profile
router.get('/profile', verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    
    // Get or create user
    const user = await User.createOrUpdateUser(req.user);
    
    // Get subscription details
    const subscriptionDetails = await User.getSubscriptionDetails(firebaseUid);
    
    // Check if subscription is active
    const hasActiveSubscription = await User.hasActiveSubscription(firebaseUid);

    res.json({
      success: true,
      user: {
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        photoURL: user.photoURL,
        isSubscribed: user.isSubscribed,
        subscriptionStatus: user.subscriptionStatus,
        currentPlan: user.currentPlan,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      subscription: subscriptionDetails,
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

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (photoURL !== undefined) updateData.photoURL = photoURL;

    await User.updateProfile(firebaseUid, updateData);

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
    
    // Get or create user
    await User.createOrUpdateUser(req.user);
    
    // Check if user has active subscription
    const hasActiveSubscription = await User.hasActiveSubscription(firebaseUid);
    
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
    
    // Get or create user
    const user = await User.createOrUpdateUser(req.user);
    
    // Get subscription details
    const subscriptionDetails = await User.getSubscriptionDetails(firebaseUid);
    
    // Check if subscription is active
    const hasActiveSubscription = await User.hasActiveSubscription(firebaseUid);

    res.json({
      success: true,
      user: {
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        photoURL: user.photoURL,
        isSubscribed: user.isSubscribed,
        subscriptionStatus: user.subscriptionStatus,
        currentPlan: user.currentPlan
      },
      subscription: subscriptionDetails,
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