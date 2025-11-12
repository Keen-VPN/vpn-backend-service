import express, { Request, Response, Router } from 'express';
import { verifyPermanentSessionToken } from '../utils/auth.js';
import NotificationService from '../services/NotificationService.js';

const router: Router = express.Router();
const notificationService = new NotificationService();

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, deviceHash, platform, environment, sessionToken } = req.body ?? {};

    if (!sessionToken || typeof sessionToken !== 'string') {
      res.status(401).json({ success: false, error: 'Session token required' });
      return;
    }

    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, error: 'Push token required' });
      return;
    }

    const payload = verifyPermanentSessionToken(sessionToken);
    if (!payload) {
      res.status(401).json({ success: false, error: 'Invalid session token' });
      return;
    }

    await notificationService.registerPushToken({
      userId: payload.userId,
      token,
      deviceHash: typeof deviceHash === 'string' ? deviceHash : null,
      platform: typeof platform === 'string' ? platform : null,
      environment: typeof environment === 'string' ? environment : null,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to register push token:', error);
    res.status(500).json({ success: false, error: 'Failed to register push token' });
  }
});

router.delete('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body ?? {};
    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, error: 'Push token required' });
      return;
    }

    await notificationService.removePushToken(token);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to remove push token:', error);
    res.status(500).json({ success: false, error: 'Failed to remove push token' });
  }
});

export default router;
