import admin from '../config/firebase.js';
import prisma from '../config/prisma.js';

export interface TrialReminderPayload {
  daysRemaining: number;
  trialEndsAt: Date;
}

interface PushTokenParams {
  userId: string;
  token: string;
  deviceHash?: string | null;
  platform?: string | null;
  environment?: string | null;
}

const INVALID_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export default class NotificationService {
  async registerPushToken(params: PushTokenParams): Promise<void> {
    const { userId, token, deviceHash = null, platform = null, environment = null } = params;

    await prisma.pushToken.upsert({
      where: { token },
      update: {
        userId,
        deviceHash,
        platform,
        environment,
      },
      create: {
        userId,
        token,
        deviceHash,
        platform,
        environment,
      },
    });
  }

  async removePushToken(token: string): Promise<void> {
    await prisma.pushToken.deleteMany({ where: { token } });
  }

  async sendTrialReminder(userId: string, payload: TrialReminderPayload): Promise<void> {
    const title = payload.daysRemaining <= 1 ? 'Trial ends soon' : 'Keep enjoying KeenVPN';
    const body = payload.daysRemaining <= 1
      ? 'Your free trial ends tomorrow. Upgrade now to stay connected.'
      : `Only ${payload.daysRemaining} days left in your free trial. Upgrade to keep your connection.`;

    const tokenRecords = await prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (tokenRecords.length === 0) {
      return;
    }

    const tokens = tokenRecords.map(({ token }) => token);

    const multicast = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: {
        type: 'trial.reminder',
        trialEndsAt: payload.trialEndsAt.toISOString(),
        daysRemaining: String(payload.daysRemaining),
      },
    });

    const invalidTokens: string[] = [];
    multicast.responses.forEach((response, index) => {
      if (!response.success && response.error) {
        const code = response.error.code;
        if (INVALID_TOKEN_ERRORS.has(code)) {
          const value = tokens[index];
          if (value) {
            invalidTokens.push(value);
          }
        } else {
          console.error('❌ Push send error', { code, message: response.error.message });
        }
      }
    });

    if (invalidTokens.length > 0) {
      await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
    }
  }

  async sendTrialExpired(userId: string): Promise<void> {
    await this.sendPush(userId, 'Trial expired', 'Your KeenVPN trial has ended. Upgrade to regain access.', {
      type: 'trial.expired',
    });
  }

  private async sendPush(userId: string, title: string, body: string, data: Record<string, string>): Promise<void> {
    const tokenRecords = await prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (tokenRecords.length === 0) {
      return;
    }

    const tokens = tokenRecords.map(({ token }) => token);

    const multicast = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
    });

    const invalidTokens: string[] = [];
    multicast.responses.forEach((response, index) => {
      if (!response.success && response.error) {
        const code = response.error.code;
        if (INVALID_TOKEN_ERRORS.has(code)) {
          const value = tokens[index];
          if (value) {
            invalidTokens.push(value);
          }
        } else {
          console.error('❌ Push send error', { code, message: response.error.message });
        }
      }
    });

    if (invalidTokens.length > 0) {
      await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
    }
  }
}
