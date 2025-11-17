import type { Request, Response, NextFunction } from 'express';
import TrialService from '../services/TrialService.js';
import { verifyPermanentSessionToken } from '../utils/auth.js';

const trialService = new TrialService();

export const requirePaidOrTrial = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // In tests we bypass paid/trial checks to keep integration tests focused on route behavior
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    const bodyToken = (req.body && typeof req.body.sessionToken === 'string')
      ? req.body.sessionToken
      : null;

    const sessionToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring('Bearer '.length).trim()
      : bodyToken;

    if (!sessionToken) {
      res.status(401).json({
        success: false,
        error: 'Authorization required',
      });
      return;
    }

    const payload = verifyPermanentSessionToken(sessionToken);
    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired session token',
      });
      return;
    }

    await trialService.expireIfNeeded(payload.userId);
    const trialStatus = await trialService.status(payload.userId);

    if (!trialStatus.trialActive && !trialStatus.isPaid) {
      console.warn('🚫 Access blocked: paid or trial required', {
        userId: payload.userId,
        trialStatus,
        path: req.path,
      });

      res.status(402).json({
        success: false,
        error: 'Subscription required. Start a trial or upgrade to continue.',
        trial: trialStatus,
      });
      return;
    }

    (req as any).authUserId = payload.userId;
    (req as any).trialStatus = trialStatus;
    next();
  } catch (error) {
    console.error('❌ requirePaidOrTrial middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal authorization error',
    });
  }
};



