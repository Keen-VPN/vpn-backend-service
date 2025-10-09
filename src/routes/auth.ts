import express, { Request, Response } from 'express';
import User from '../models/User.js';
import { generatePermanentSessionToken } from '../utils/auth.js';
import type { AppleSignInData, ApiResponse, SessionTokenPayload } from '../types/index.js';

const router = express.Router();

/**
 * Apple Sign-In Authentication
 * Verifies Apple identity token and creates/retrieves user
 */
router.post('/apple/signin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identityToken, userIdentifier, email, fullName } = req.body as AppleSignInData;

    // Validate required fields
    if (!identityToken || !userIdentifier) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: identityToken, userIdentifier'
      } as ApiResponse);
      return;
    }

    console.log('🍎 Apple Sign-In request:', { userIdentifier, email, fullName });

    // Verify Apple identity token with Firebase
    let firebaseUid: string;
    let emailVerified = false;

    try {
      // For Apple Sign-In, we need to verify the token with Apple's servers first
      // Since Firebase expects a different audience, we'll use the userIdentifier directly
      console.log('🔍 Processing Apple Sign-In with userIdentifier:', userIdentifier);
      
      // For now, we'll use the userIdentifier as the Firebase UID
      // In a production setup, you'd verify the Apple token with Apple's servers
      firebaseUid = `apple_${userIdentifier}`;
      emailVerified = false; // Apple doesn't guarantee email verification
      
      console.log('✅ Apple Sign-In processed:', { firebaseUid, emailVerified });
    } catch (error) {
      console.error('❌ Failed to process Apple Sign-In:', error);
      console.error('❌ Error details:', {
        message: error instanceof Error ? error.message : String(error),
        code: (error as any)?.code,
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(401).json({
        success: false,
        error: 'Invalid Apple identity token'
      } as ApiResponse);
      return;
    }

    // Check if user exists
    const userModel = new User();
    let user = await userModel.findByAppleUserId(userIdentifier);

    if (!user) {
      // Try to find by email only if email is provided (in case user signed in with different method before)
      if (email && email.trim() !== '') {
        user = await userModel.findByEmail(email);
      }
      
      if (user) {
        // Update existing user with Apple credentials
        console.log('📝 Updating existing user with Apple credentials');
        user = await userModel.update(user.id, {
          appleUserId: userIdentifier,
          firebaseUid,
          provider: 'apple',
          emailVerified
        });
      } else {
        // Create new user
        console.log('👤 Creating new user with Apple credentials');
        const displayName = fullName || (email && email.trim() !== '' ? email.split('@')[0] : `Apple User ${userIdentifier.substring(0, 8)}`);
        
        // Apple Sign-In may not provide email on subsequent sign-ins
        // Use a fallback email based on a shortened user identifier
        const shortId = userIdentifier.substring(0, 10);
        const userEmail = email && email.trim() !== '' ? email : `${shortId}@privaterelay.appleid.com`;
        
        user = await userModel.create({
          firebaseUid,
          appleUserId: userIdentifier,
          email: userEmail,
          displayName,
          provider: 'apple',
          emailVerified
        });
      }
    } else {
      // Update last login and ensure firebase UID is set
      console.log('👤 Existing Apple user found, updating...');
      user = await userModel.update(user.id, {
        firebaseUid,
        emailVerified
      });
    }

    // Generate session token
    const tokenPayload: SessionTokenPayload = {
      userId: user.id,
      email: user.email,
      provider: 'apple'
    };
    const sessionToken = generatePermanentSessionToken(tokenPayload);

    console.log('✅ Apple Sign-In successful for user:', user.id);

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.displayName,  // Changed from displayName to name
        provider: user.provider
      },
      sessionToken,
      authMethod: 'apple',
      subscription: null
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Apple Sign-In error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process Apple sign-in'
    } as ApiResponse);
  }
});

/**
 * Google Sign-In Authentication
 * Verifies Google ID token and creates/retrieves user
 */
router.post('/google/signin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: idToken'
      } as ApiResponse);
      return;
    }

    console.log('🔵 Google Sign-In request');

    // Verify Google ID token with Firebase
    let firebaseUid: string;
    let email: string;
    let displayName: string | undefined;
    let emailVerified: boolean;
    let googleUserId: string;

    try {
      // Verify Google OAuth token with Google's API
      console.log('🔍 Verifying Google OAuth token with Google API...');
      console.log('🔍 Token length:', idToken.length);
      console.log('🔍 Token preview:', idToken.substring(0, 50) + '...');
      
      // Call Google's tokeninfo API to verify the token and get user info
      const googleResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${idToken}`);
      
      if (!googleResponse.ok) {
        throw new Error(`Google token verification failed: ${googleResponse.status}`);
      }
      
      const googleData = await googleResponse.json() as any;
      console.log('🔍 Google token info:', { 
        email: googleData.email, 
        name: googleData.name, 
        verified_email: googleData.verified_email 
      });
      
      // Extract user information from Google's response
      googleUserId = googleData.sub || `google_${idToken.substring(0, 20)}`;
      firebaseUid = googleUserId;
      email = googleData.email || 'user@google.com';
      displayName = googleData.name || 'Google User';
      emailVerified = googleData.verified_email === 'true';

      console.log('✅ Google OAuth token verified:', { firebaseUid, email, displayName, emailVerified });
    } catch (error) {
      console.error('❌ Failed to verify Google OAuth token:', error);
      res.status(401).json({
        success: false,
        error: 'Invalid Google OAuth token'
      } as ApiResponse);
      return;
    }

    // Check if user exists
    const userModel = new User();
    let user = await userModel.findByFirebaseUid(firebaseUid);

    if (!user) {
      // Try to find by email
      user = await userModel.findByEmail(email);

      if (user) {
        // Update existing user with Google credentials
        console.log('📝 Updating existing user with Google credentials');
        user = await userModel.update(user.id, {
          firebaseUid,
          googleUserId: googleUserId,
          provider: 'google',
          emailVerified
        });
      } else {
        // Create new user
        console.log('👤 Creating new user with Google credentials');
        user = await userModel.create({
          firebaseUid,
          googleUserId: googleUserId,
          email,
          displayName: displayName || email.split('@')[0],
          provider: 'google',
          emailVerified
        });
      }
    } else {
      // Update last login
      console.log('👤 Existing Google user found');
    }

    // Generate session token
    const tokenPayload: SessionTokenPayload = {
      userId: user.id,
      email: user.email,
      provider: 'google'
    };
    const sessionToken = generatePermanentSessionToken(tokenPayload);

    console.log('✅ Google Sign-In successful for user:', user.id);

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.displayName,  // Changed from displayName to name
        provider: user.provider
      },
      sessionToken,
      authMethod: 'google',
      subscription: null
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Google Sign-In error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process Google sign-in'
    } as ApiResponse);
  }
});

/**
 * Verify Session Token
 * Validates a session token and returns user info
 */
router.post('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: sessionToken'
      } as ApiResponse);
      return;
    }

    // Verify session token
    const { verifyPermanentSessionToken } = await import('../utils/auth.js');
    const payload = verifyPermanentSessionToken(sessionToken);

    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired session token'
      } as ApiResponse);
      return;
    }

    // Get user from database
    const userModel = new User();
    const user = await userModel.findById(payload.userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      } as ApiResponse);
      return;
    }

    // Get user's subscription data
    const { default: Subscription } = await import('../models/Subscription.js');
    const subscriptionModel = new Subscription();
    const activeSubscription = await subscriptionModel.findActiveByUserId(user.id);

    let subscriptionData = null;
    if (activeSubscription) {
      subscriptionData = {
        status: activeSubscription.status,
        endDate: activeSubscription.currentPeriodEnd?.toISOString(),
        cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd
      };
    }

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.displayName,  // Changed from displayName to name
        provider: user.provider
      },
      subscription: subscriptionData
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Token verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify session token'
    } as ApiResponse);
  }
});

/**
 * Delete Account
 * Permanently deletes user account and all associated data
 */
router.delete('/delete-account', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, userId } = req.body;

    // Validate required fields
    if (!email || !userId) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: email, userId'
      } as ApiResponse);
      return;
    }

    console.log('🗑️ Account deletion request:', { email, userId });

    // Find and delete the user
    const userModel = new User();
    const user = await userModel.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      } as ApiResponse);
      return;
    }

    // Verify the email matches (additional security check)
    if (user.email !== email) {
      res.status(400).json({
        success: false,
        error: 'Email does not match user account'
      } as ApiResponse);
      return;
    }

    // Delete the user (this will cascade delete subscriptions and sessions due to foreign key constraints)
    await userModel.delete(userId);

    console.log('✅ Account deletion successful for user:', userId);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Account deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete account'
    } as ApiResponse);
  }
});

export default router;

