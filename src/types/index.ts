/**
 * Type definitions for KeenVPN Backend
 */

// User related types
export interface CreateUserData {
  firebaseUid?: string;
  appleUserId?: string;
  googleUserId?: string;
  email: string;
  displayName?: string;
  provider?: 'google' | 'apple' | 'firebase' | 'demo';
  emailVerified?: boolean;
}

export interface UpdateUserData {
  displayName?: string;
  firebaseUid?: string;
  appleUserId?: string;
  googleUserId?: string;
  provider?: string;
  emailVerified?: boolean;
  stripeCustomerId?: string;
}

// Subscription related types
export interface CreateSubscriptionData {
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status?: 'active' | 'inactive' | 'cancelled' | 'past_due' | 'trialing';
  planId?: string;
  planName?: string;
  priceAmount?: number;
  priceCurrency?: string;
  billingPeriod?: 'year' | 'month';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
}

export interface UpdateSubscriptionData {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status?: 'active' | 'inactive' | 'cancelled' | 'past_due' | 'trialing';
  planId?: string;
  planName?: string;
  priceAmount?: number;
  priceCurrency?: string;
  billingPeriod?: 'year' | 'month';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: Date | null;
}

// Connection Session related types
export interface CreateConnectionSessionData {
  userId: string;
  sessionStart: Date;
  sessionEnd?: Date | null;
  durationSeconds: number;
  serverLocation?: string | null;
  serverAddress?: string | null;
  platform: string;
  appVersion?: string | null;
  bytesTransferred?: bigint | number;
  subscriptionTier?: string | null;
}

export interface UpdateConnectionSessionData {
  sessionEnd?: Date;
  durationSeconds?: number;
  bytesTransferred?: bigint | number;
}

export interface ConnectionSessionQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'sessionStart' | 'durationSeconds';
  ascending?: boolean;
}

export interface ConnectionStats {
  total_sessions: number;
  total_duration_seconds: number;
  total_bytes_transferred: number;
  average_duration_seconds: number;
  platform_breakdown: Record<string, {
    sessions: number;
    duration: number;
    bytes: number;
  }>;
  location_breakdown: Record<string, {
    sessions: number;
    duration: number;
    bytes: number;
  }>;
  most_recent_session: {
    date: Date;
    duration: number;
    server: string | null;
  } | null;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DeleteAccountResult {
  success: boolean;
  deletedUserId: string;
  deletedEmail: string;
  stripeCustomerIds: string[];
}

// Authentication types
export interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified: boolean;
}

export interface AppleSignInData {
  identityToken: string;
  userIdentifier: string;
  email: string;
  fullName?: string;
}

export interface SessionTokenPayload {
  userId: string;
  email: string;
  provider: 'google' | 'apple' | 'firebase' | 'demo';
}

// Stripe webhook event types
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
}

