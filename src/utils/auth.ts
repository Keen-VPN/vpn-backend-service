import jwt from 'jsonwebtoken';
import type { SessionTokenPayload } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Verify permanent session token
 * @param sessionToken - JWT session token
 * @returns User info from token or null
 */
export function verifyPermanentSessionToken(sessionToken: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(sessionToken, JWT_SECRET) as SessionTokenPayload;
    return decoded;
  } catch (error) {
    console.error('❌ Session token verification failed:', error);
    return null;
  }
}

/**
 * Generate permanent session token
 * @param payload - User data to encode
 * @returns JWT session token
 */
export function generatePermanentSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '30d'
  });
}

