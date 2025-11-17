import type { TrialStatus } from '../types/index.js';

interface RawTrialStatus {
  trialActive: boolean;
  trialEndsAt: Date | null;
  daysRemaining: number;
  isPaid: boolean;
  tier: string | null;
}

export function serializeTrialStatus(status: RawTrialStatus): TrialStatus {
  return {
    trialActive: status.trialActive,
    trialEndsAt: status.trialEndsAt ? status.trialEndsAt.toISOString() : null,
    daysRemaining: status.daysRemaining,
    isPaid: status.isPaid,
    tier: status.tier,
  };
}
