import prisma from '../config/prisma.js';
import Subscription from '../models/Subscription.js';
import type { Prisma } from '@prisma/client';
import NotificationService from './NotificationService.js';
import {
  addDaysUtc,
  isBeforeUtc,
  computeTrialDaysRemaining,
} from './trial-helpers.js';

const TRIAL_DURATION_DAYS = 30;
const TRIAL_TIER_NAME = 'free_trial';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface GrantResult {
  granted: boolean;
  reason?: string;
  userId: string;
  trialEndsAt?: Date;
}

interface TrialStatus {
  trialActive: boolean;
  trialEndsAt: Date | null;
  daysRemaining: number;
  isPaid: boolean;
  tier: string | null;
}

type PrismaUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

export default class TrialService {
  private subscriptionModel = new Subscription();
  private reminderTimers = new Map<string, NodeJS.Timeout[]>();
  private notificationService = new NotificationService();

  async grantIfEligible(user: PrismaUser, deviceHash: string | null): Promise<GrantResult> {
    if (!process.env.FF_TRIALS_ENABLED || process.env.FF_TRIALS_ENABLED !== 'true') {
      return { granted: false, reason: 'feature_disabled', userId: user.id };
    }

    const now = new Date();
    const expiresAt = addDaysUtc(now, TRIAL_DURATION_DAYS);

    const result = await prisma.$transaction(async (tx) => {
      const existingGrant = await tx.trialGrant.findUnique({
        where: { userId: user.id }
      });

      if (existingGrant) {
        await this.emitTelemetry('trial.blocked', { userId: user.id, reason: 'existing_grant' });
        return { granted: false, reason: 'existing_grant', userId: user.id };
      }

      const hasActiveSubscription = await this.subscriptionModel.hasActiveSubscription(user.id);
      if (hasActiveSubscription) {
        await this.emitTelemetry('trial.blocked', { userId: user.id, reason: 'already_paid' });
        return { granted: false, reason: 'already_paid', userId: user.id };
      }

      if (deviceHash) {
        const existingFingerprint = await tx.deviceTrialFingerprint.findUnique({
          where: { hash: deviceHash }
        });

        if (existingFingerprint && existingFingerprint.userId !== user.id) {
          await this.emitTelemetry('trial.blocked', {
            userId: user.id,
            reason: 'device_hash_exists',
            existingUserId: existingFingerprint.userId
          });
          return { granted: false, reason: 'device_hash_exists', userId: user.id };
        }

        await this.upsertDeviceFingerprint(tx, user.id, deviceHash, user.provider ?? null, now);
      }

      const trial = await tx.trialGrant.create({
        data: {
          userId: user.id,
          deviceHash: deviceHash ?? 'unknown',
          expiresAt
        }
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          trialActive: true,
          trialStartsAt: now,
          trialEndsAt: expiresAt,
          trialTier: TRIAL_TIER_NAME
        }
      });

      await this.emitTelemetry('trial.granted', {
        userId: user.id,
        grantId: trial.id,
        expiresAt: expiresAt.toISOString()
      });

      return { granted: true, userId: user.id, trialEndsAt: expiresAt };
    });

    if (result.granted && result.trialEndsAt) {
      this.scheduleReminderJobs(user.id, result.trialEndsAt);
    }

    return result;
  }

  async touchDeviceFingerprint(userId: string, deviceHash: string | null, platform: string | null = null): Promise<void> {
    if (!deviceHash) return;
    const now = new Date();
    await prisma.deviceTrialFingerprint.upsert({
      where: { hash: deviceHash },
      update: { userId, lastSeen: now, platform: platform ?? undefined },
      create: {
        hash: deviceHash,
        userId,
        platform: platform ?? undefined
      }
    });
  }

  async status(userId: string): Promise<TrialStatus> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        trialActive: true,
        trialEndsAt: true,
        trialTier: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const now = new Date();
    const trialEndsAt = user.trialEndsAt ?? null;
    const trialActive = Boolean(user.trialActive && trialEndsAt && isBeforeUtc(now, trialEndsAt));
    const daysRemaining = trialEndsAt
      ? computeTrialDaysRemaining(trialEndsAt, now)
      : 0;

    const isPaid = await this.subscriptionModel.hasActiveSubscription(userId);

    if (trialActive && trialEndsAt && !this.reminderTimers.has(userId)) {
      this.scheduleReminderJobs(userId, trialEndsAt);
    }

    return {
      trialActive,
      trialEndsAt,
      daysRemaining,
      isPaid,
      tier: user.trialTier ?? null
    };
  }

  async expireIfNeeded(userId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          trialActive: true,
          trialEndsAt: true
        }
      });

      if (!user?.trialActive || !user.trialEndsAt) {
        return;
      }

      if (isBeforeUtc(user.trialEndsAt, new Date())) {
        await tx.user.update({
          where: { id: userId },
          data: {
            trialActive: false,
            trialTier: null
          }
        });

        this.clearReminderTimers(userId);
        await this.notificationService.sendTrialExpired(userId);
        await this.emitTelemetry('trial.expired', {
          userId,
          expiredAt: new Date().toISOString()
        });
      }
    });
  }

  private async upsertDeviceFingerprint(
    tx: Prisma.TransactionClient,
    userId: string,
    deviceHash: string,
    platform: string | null,
    now: Date
  ) {
    await tx.deviceTrialFingerprint.upsert({
      where: { hash: deviceHash },
      update: { userId, lastSeen: now, platform: platform ?? undefined },
      create: {
        hash: deviceHash,
        userId,
        platform: platform ?? undefined
      }
    });
  }

  private async emitTelemetry(event: 'trial.granted' | 'trial.reminder.sent' | 'trial.expired' | 'trial.blocked', payload: Record<string, unknown>) {
    console.log(`[telemetry] ${event}`, payload);
  }

  private scheduleReminderJobs(userId: string, expiresAt: Date) {
    this.clearReminderTimers(userId);
    const timers: NodeJS.Timeout[] = [];
    const now = Date.now();
    const reminderAt = expiresAt.getTime() - 3 * MS_PER_DAY;

    if (reminderAt > now) {
      const reminderDelay = reminderAt - now;
      timers.push(
        this.scheduleDeferred(reminderDelay, async () => {
          await this.notificationService.sendTrialReminder(userId, {
            daysRemaining: computeTrialDaysRemaining(expiresAt, new Date()),
            trialEndsAt: expiresAt
          });
          await this.emitTelemetry('trial.reminder.sent', {
            userId,
            reminderAt: new Date().toISOString(),
            expiresAt: expiresAt.toISOString()
          });
        })
      );
    } else if (reminderAt <= now && expiresAt.getTime() > now) {
      // If less than 3 days remain when granted, emit immediately
      void this.notificationService.sendTrialReminder(userId, {
        daysRemaining: computeTrialDaysRemaining(expiresAt, new Date()),
        trialEndsAt: expiresAt
      });
      void this.emitTelemetry('trial.reminder.sent', {
        userId,
        reminderAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        reason: 'late_grant'
      });
    }

    const expiryDelay = expiresAt.getTime() - now;
    if (expiryDelay > 0) {
      timers.push(
        this.scheduleDeferred(expiryDelay, async () => {
          await this.expireIfNeeded(userId);
        })
      );
    } else {
      void this.expireIfNeeded(userId);
    }

    if (timers.length > 0) {
      this.reminderTimers.set(userId, timers);
    }
  }

  private clearReminderTimers(userId: string) {
    const timers = this.reminderTimers.get(userId);
    if (!timers) return;
    for (const timer of timers) {
      clearTimeout(timer);
    }
    this.reminderTimers.delete(userId);
  }

  private scheduleDeferred(
    delayMs: number,
    callback: () => Promise<void>
  ): NodeJS.Timeout {
    const MAX_TIMEOUT = 2_147_483_647;
    if (delayMs <= 0) {
      void callback();
      return setTimeout(() => {}, 0);
    }

    if (delayMs > MAX_TIMEOUT) {
      return setTimeout(() => {
        this.scheduleDeferred(delayMs - MAX_TIMEOUT, callback);
      }, MAX_TIMEOUT);
    }

    return setTimeout(() => {
      callback().catch((error) => {
        console.error("❌ Trial reminder callback failed:", error);
      });
    }, delayMs);
  }
}

