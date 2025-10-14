import type { Prisma } from '@prisma/client';

// Type-safe subscription data for creation
export interface SubscriptionCreateData {
  userId: string;
  subscriptionType?: 'stripe' | 'apple_iap';
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  appleTransactionId?: string | null;
  appleOriginalTransactionId?: string | null;
  appleProductId?: string | null;
  appleEnvironment?: 'Sandbox' | 'Production' | null;
  status?: 'active' | 'inactive' | 'cancelled' | 'past_due' | 'trialing';
  planId?: string | null;
  planName?: string | null;
  priceAmount?: number | Prisma.Decimal | null;
  priceCurrency?: string | null;
  billingPeriod?: 'year' | 'month' | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
}

// Type-safe subscription where conditions
export interface SubscriptionWhereUnique {
  id?: string;
  stripeSubscriptionId?: string;
  appleTransactionId?: string;
}

export interface SubscriptionWhere {
  userId?: string;
  appleOriginalTransactionId?: string;
  subscriptionType?: 'stripe' | 'apple_iap';
  status?: string;
}

// Extended subscription type with all fields
export interface SubscriptionWithAppleIAP {
  id: string;
  userId: string;
  subscriptionType: 'stripe' | 'apple_iap';
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  appleTransactionId: string | null;
  appleOriginalTransactionId: string | null;
  appleProductId: string | null;
  appleEnvironment: 'Sandbox' | 'Production' | null;
  status: string;
  planId: string | null;
  planName: string | null;
  priceAmount: Prisma.Decimal | null;
  priceCurrency: string | null;
  billingPeriod: 'year' | 'month' | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
