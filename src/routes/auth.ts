import express, { Request, Response } from 'express';
import admin from '../config/firebase.js';
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
    if (!identityToken || !userIdentifier || !email) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: identityToken, userIdentifier, email'
      } as ApiResponse);
      return;
    }

    console.log('🍎 Apple Sign-In request:', { userIdentifier, email, fullName });

    // Verify Apple identity token with Firebase
    let firebaseUid: string;
    let emailVerified = false;

    try {
      // Verify the identity token with Firebase
      // Firebase Admin SDK can verify Apple tokens
      const decodedToken = await admin.auth().verifyIdToken(identityToken);
      firebaseUid = decodedToken.uid;
      emailVerified = decodedToken.email_verified || false;
      
      console.log('✅ Apple token verified with Firebase:', { firebaseUid, emailVerified });
    } catch (error) {
      console.error('❌ Failed to verify Apple identity token:', error);
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
      // Try to find by email (in case user signed in with different method before)
      user = await userModel.findByEmail(email);
      
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
        user = await userModel.create({
          firebaseUid,
          appleUserId: userIdentifier,
          email,
          displayName: fullName || email.split('@')[0],
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
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          provider: user.provider,
          emailVerified: user.emailVerified
        },
        sessionToken,
        firebaseUid
      }
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
    let decodedToken: admin.auth.DecodedIdToken;
    let firebaseUid: string;
    let email: string;
    let displayName: string | undefined;
    let emailVerified: boolean;

    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
      firebaseUid = decodedToken.uid;
      email = decodedToken.email || '';
      displayName = decodedToken.name;
      emailVerified = decodedToken.email_verified || false;

      if (!email) {
        throw new Error('No email found in token');
      }

      console.log('✅ Google token verified:', { firebaseUid, email, emailVerified });
    } catch (error) {
      console.error('❌ Failed to verify Google ID token:', error);
      res.status(401).json({
        success: false,
        error: 'Invalid Google ID token'
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
          googleUserId: decodedToken.sub,
          provider: 'google',
          emailVerified
        });
      } else {
        // Create new user
        console.log('👤 Creating new user with Google credentials');
        user = await userModel.create({
          firebaseUid,
          googleUserId: decodedToken.sub,
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
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          provider: user.provider,
          emailVerified: user.emailVerified
        },
        sessionToken,
        firebaseUid
      }
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

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          provider: user.provider,
          emailVerified: user.emailVerified
        }
      }
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Token verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify session token'
    } as ApiResponse);
  }
});

export default router;

