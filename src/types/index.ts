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
  provider?: "google" | "apple" | "firebase" | "demo";
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
  trialActive?: boolean;
  trialStartsAt?: Date | null;
  trialEndsAt?: Date | null;
  trialTier?: string | null;
}

// Subscription related types
export interface CreateSubscriptionData {
  userId: string;
  subscriptionType?: "stripe" | "apple_iap";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  appleTransactionId?: string;
  appleOriginalTransactionId?: string;
  appleProductId?: string;
  appleEnvironment?: "Sandbox" | "Production";
  status?: "active" | "inactive" | "cancelled" | "past_due" | "trialing";
  planId?: string;
  planName?: string;
  priceAmount?: number;
  priceCurrency?: string;
  billingPeriod?: "year" | "month";
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
}

export interface TrialStatus {
  trialActive: boolean;
  trialEndsAt: string | null;
  daysRemaining: number;
  isPaid: boolean;
  tier: string | null;
}

export interface UpdateSubscriptionData {
  subscriptionType?: "stripe" | "apple_iap";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  appleTransactionId?: string;
  appleOriginalTransactionId?: string;
  appleProductId?: string;
  appleEnvironment?: "Sandbox" | "Production";
  status?: "active" | "inactive" | "cancelled" | "past_due" | "trialing";
  planId?: string;
  planName?: string;
  priceAmount?: number;
  priceCurrency?: string;
  billingPeriod?: "year" | "month";
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: Date | null;
}

// Connection Session related types
export type TerminationReason = "USER_TERMINATION" | "CONNECTION_LOST";
export type EventType = "SESSION_START" | "HEARTBEAT" | "SESSION_END";

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
  terminationReason?: TerminationReason;
  eventType?: EventType;
  heartbeatTimestamp?: Date | null;
}

export interface UpdateConnectionSessionData {
  sessionEnd?: Date;
  durationSeconds?: number;
  bytesTransferred?: bigint | number;
  eventType?: EventType;
  heartbeatTimestamp?: Date | null;
}

export interface ConnectionSessionQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: "createdAt" | "sessionStart" | "durationSeconds";
  ascending?: boolean;
}

export interface ConnectionStats {
  total_sessions: number;
  total_duration_seconds: number;
  total_bytes_transferred: number;
  average_duration_seconds: number;
  platform_breakdown: Record<
    string,
    {
      sessions: number;
      duration: number;
      bytes: number;
    }
  >;
  location_breakdown: Record<
    string,
    {
      sessions: number;
      duration: number;
      bytes: number;
    }
  >;
  most_recent_session: {
    date: Date;
    duration: number;
    server: string | null;
  } | null;
}

// Subscription Plan types
export interface SubscriptionPlan {
  id: "premium_monthly" | "premium_yearly";
  name: string;
  description?: string;
  price: number;
  period: "month" | "year";
  interval: "month" | "year";
  billingPeriod: "month" | "year";
  features: { name: string; included: boolean; highlighted?: boolean }[];
  priceId: string;
  checkoutLink?: string;
}

export interface CreateCheckoutSessionRequest {
  sessionToken?: string;
  idToken?: string;
  email?: string;
  planId: "premium_monthly" | "premium_yearly";
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

export interface SubscriptionStatusSummary {
  status: string;
  plan?: string;
  endDate?: string | Date | null;
  customerId?: string;
  cancelAtPeriodEnd?: boolean;
  subscriptionType?: string;
}

export interface SubscriptionStatusResponse {
  success: boolean;
  subscription: SubscriptionStatusSummary;
  hasActiveSubscription: boolean;
  trial: TrialStatus;
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
  // Optional: Transaction IDs from StoreKit to link IAP purchases during login
  transactionIds?: Array<{
    transactionId: string;
    originalTransactionId: string;
    productId: string;
  }>;
}

export interface SessionTokenPayload {
  userId: string;
  email: string;
  provider: "google" | "apple" | "firebase" | "demo";
}

// Apple IAP types
export interface AppleIAPReceipt {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  environment: "Sandbox" | "Production";
  expiresDateMs?: string;
  purchaseDateMs: string;
  quantity?: number;
}

export interface CaptureAppleIAPRequest {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDateMs: string;
  expiresDateMs?: string;
  receiptData?: string | null;
  environment?: "Sandbox" | "Production" | null;
}

export interface AppleIAPPurchaseLedgerEntry {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  environment?: "Sandbox" | "Production" | null;
  purchaseDate: string;
  expiresDate?: string | null;
  linkedUserId?: string | null;
  linkedEmail?: string | null;
  linkedAt?: string | null;
}

export interface CaptureAppleIAPResponse {
  success: boolean;
  purchase: AppleIAPPurchaseLedgerEntry;
}

export interface LinkAppleIAPRequest {
  sessionToken: string;
  receiptData: string; // Base64 encoded receipt
  transactionId: string;
  originalTransactionId: string;
  productId: string;
}

export interface LinkAppleIAPResponseBody {
  success: boolean;
  message?: string;
  subscription?: {
    id: string;
    status: string;
    planName?: string | null;
    endDate?: string | null;
    subscriptionType: "apple_iap";
  } | null;
  error?: string;
  errorCode?:
    | "iap_already_linked"
    | "iap_not_found"
    | "iap_link_conflict"
    | "iap_already_active"
    | "iap_missing_fields"
    | "unauthorized"
    | "server_error";
  linkedEmail?: string | null;
}

// Stripe webhook event types
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
}

// Sales Contact types
export interface CreateSalesContactData {
  companyName: string;
  workEmail: string;
  teamSize: number;
  countryRegion?: string;
  hasConsent: boolean;
  phone?: string;
  useCase?: string;
  preferredContactMethod?: string;
  preferredContactTime?: string;
  message?: string;
  userAgent?: string;
}

export interface SalesContactRequest {
  companyName: string;
  workEmail: string;
  teamSize: number;
  countryRegion?: string;
  hasConsent: boolean;
  phone?: string;
  useCase?: string;
  preferredContactMethod?: string;
  preferredContactTime?: string;
  message?: string;
}

export interface SalesContactResponse {
  success: boolean;
  referenceId?: string;
  message?: string;
  error?: string;
}

export interface UpdateSalesContactData {
  status?: "pending" | "contacted" | "converted" | "spam";
  salesTeamNotified?: boolean;
  customerConfirmationSent?: boolean;
}

// Email configuration types
export interface EmailConfig {
  salesTeamEmail: string;
  fromEmail: string;
  fromName: string;
}

// Validation helper types
export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Remote VPN configuration types
export interface RemoteVPNServerCoordinates {
  lat: number;
  lng: number;
}

export interface RemoteVPNCredential {
  id: string;
  username: string;
  password: string;
  sharedSecret?: string | null;
  certificate?: string | null;
  certificatePassword?: string | null;
  metadata?: Record<string, string> | null;
}

export interface RemoteVPNServer {
  id: string;
  name: string;
  country: string;
  city: string;
  serverAddress: string;
  remoteIdentifier?: string | null;
  credentialId: string;
  assetKey?: string | null;
  flagUrl?: string | null;
  coordinates?: RemoteVPNServerCoordinates | null;
  isDefault?: boolean | null;
  sortOrder?: number | null;
  metadata?: Record<string, string> | null;
}

export interface RemoteVPNRollout {
  minAppVersion?: string | null;
  maxAppVersion?: string | null;
  allowDuringReview?: boolean | null;
  stagedPercentage?: number | null;
  channels?: string[] | null;
  metadata?: Record<string, string> | null;
}

export interface RemoteVPNConfig {
  version: string;
  updatedAt?: string | null;
  servers: RemoteVPNServer[];
  credentials: RemoteVPNCredential[];
  featureFlags?: Record<string, boolean> | null;
  rollout?: RemoteVPNRollout | null;
  metadata?: Record<string, string> | null;
}

export interface VPNConfigRecord {
  id: string;
  version: string;
  payload: RemoteVPNConfig;
  etag: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveVPNConfigRequest {
  config: RemoteVPNConfig;
  activate?: boolean;
  etag?: string;
}

export interface UpdateVPNConfigRequest {
  config?: RemoteVPNConfig;
  activate?: boolean;
  etag?: string;
}

export interface VPNConfigResponseBody {
  config: RemoteVPNConfig;
  version: string;
  etag: string;
  source: "database" | "fallback";
  updatedAt: string | null;
}
