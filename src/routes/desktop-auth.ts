import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { generatePermanentSessionToken } from '../utils/auth.js';
import User from '../models/User.js';
import type { ApiResponse, SessionTokenPayload } from '../types/index.js';

const router = express.Router();

// In-memory store for one-time codes (in production, use Redis)
const codeStore = new Map<string, {
  userId: string;
  codeChallenge: string;
  createdAt: number;
  deviceId?: string;
}>();

// Clean up expired codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  const TTL = 60 * 1000; // 60 seconds
  
  for (const [code, data] of codeStore.entries()) {
    if (now - data.createdAt > TTL) {
      codeStore.delete(code);
    }
  }
}, 5 * 60 * 1000);

/**
 * Generate one-time code for desktop app
 * POST /api/desktop-auth/generate-code
 * Body: { sessionToken, codeChallenge, deviceId? }
 */
router.post('/generate-code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken, codeChallenge, deviceId } = req.body;

    if (!sessionToken || !codeChallenge) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionToken, codeChallenge'
      } as ApiResponse);
      return;
    }

    // Verify session token
    const { verifyPermanentSessionToken } = await import('../utils/auth.js');
    const payload = verifyPermanentSessionToken(sessionToken);

    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Invalid session token'
      } as ApiResponse);
      return;
    }

    // Generate one-time code
    const code = crypto.randomBytes(32).toString('base64url');
    
    // Store code with PKCE challenge
    codeStore.set(code, {
      userId: payload.userId,
      codeChallenge,
      createdAt: Date.now(),
      deviceId
    });

    console.log('✅ Generated one-time code for user:', payload.userId);

    res.status(200).json({
      success: true,
      code,
      deepLink: `vpnkeen://auth/callback?code=${code}`
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Generate code error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate code'
    } as ApiResponse);
  }
});

/**
 * Exchange one-time code for access tokens (PKCE verification)
 * POST /api/desktop-auth/exchange
 * Body: { code, codeVerifier, deviceId? }
 */
router.post('/exchange', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, codeVerifier, deviceId } = req.body;

    if (!code || !codeVerifier) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: code, codeVerifier'
      } as ApiResponse);
      return;
    }

    // Retrieve code data
    const codeData = codeStore.get(code);

    if (!codeData) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired code'
      } as ApiResponse);
      return;
    }

    // Verify code is not expired (60 seconds TTL)
    const now = Date.now();
    if (now - codeData.createdAt > 60 * 1000) {
      codeStore.delete(code);
      res.status(401).json({
        success: false,
        error: 'Code expired'
      } as ApiResponse);
      return;
    }

    // Verify PKCE challenge
    const computedChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    if (computedChallenge !== codeData.codeChallenge) {
      console.error('❌ PKCE verification failed');
      codeStore.delete(code);
      res.status(401).json({
        success: false,
        error: 'Invalid code verifier'
      } as ApiResponse);
      return;
    }

    // Verify device ID if provided
    if (deviceId && codeData.deviceId && deviceId !== codeData.deviceId) {
      console.error('❌ Device ID mismatch');
      codeStore.delete(code);
      res.status(401).json({
        success: false,
        error: 'Device ID mismatch'
      } as ApiResponse);
      return;
    }

    // Delete code (one-time use)
    codeStore.delete(code);

    // Get user
    const userModel = new User();
    const user = await userModel.findById(codeData.userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      } as ApiResponse);
      return;
    }

    // Generate new session token for desktop app
    const tokenPayload: SessionTokenPayload = {
      userId: user.id,
      email: user.email,
      provider: (user.provider as 'google' | 'apple' | 'firebase' | 'demo') || 'demo'
    };
    const accessToken = generatePermanentSessionToken(tokenPayload);
    
    // Generate refresh token (in production, implement proper refresh token logic)
    const refreshToken = generatePermanentSessionToken(tokenPayload);

    console.log('✅ Code exchanged successfully for user:', user.id);

    res.status(200).json({
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 31536000, // 1 year
      user: {
        id: user.id,
        email: user.email,
        name: user.displayName,
        provider: user.provider
      }
    } as ApiResponse);

  } catch (error) {
    console.error('❌ Code exchange error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to exchange code'
    } as ApiResponse);
  }
});

export default router;

