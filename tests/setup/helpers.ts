import { faker } from "@faker-js/faker";
import { testPrisma } from "./test-db.js";
import { generatePermanentSessionToken } from "../../src/utils/auth.js";
import type {
  User as PrismaUser,
  Subscription as PrismaSubscription,
} from "@prisma/client";
import type { SessionTokenPayload } from "../../src/types/index.js";

export interface TestUserData {
  firebaseUid?: string;
  appleUserId?: string;
  googleUserId?: string;
  email?: string;
  displayName?: string;
  provider?: string;
  emailVerified?: boolean;
}

export interface TestSubscriptionData {
  userId: string;
  status?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  planName?: string;
  priceAmount?: number;
  currentPeriodEnd?: Date;
}

export async function createTestUser(
  data?: Partial<TestUserData>
): Promise<PrismaUser> {
  const email = data?.email || faker.internet.email();
  const provider = data?.provider || "google";

  return await testPrisma.user.create({
    data: {
      firebaseUid:
        data?.firebaseUid || `test-${provider}-${faker.string.uuid()}`,
      appleUserId: data?.appleUserId,
      googleUserId: data?.googleUserId,
      email,
      displayName: data?.displayName || faker.person.fullName(),
      provider,
      emailVerified: data?.emailVerified ?? true,
    },
  });
}

export async function createTestSubscription(
  data: TestSubscriptionData
): Promise<PrismaSubscription> {
  return await testPrisma.subscription.create({
    data: {
      userId: data.userId,
      status: data.status || "active",
      stripeCustomerId:
        data.stripeCustomerId || `cus_test_${faker.string.alphanumeric(14)}`,
      stripeSubscriptionId:
        data.stripeSubscriptionId ||
        `sub_test_${faker.string.alphanumeric(14)}`,
      planName: data.planName || "Premium VPN - Annual",
      priceAmount: data.priceAmount || 100.0,
      priceCurrency: "USD",
      billingPeriod: "yearly",
      currentPeriodStart: new Date(),
      currentPeriodEnd:
        data.currentPeriodEnd || new Date(Date.now() + 31536000000),
      cancelAtPeriodEnd: false,
    },
  });
}

export async function createTestConnectionSession(
  userId: string,
  platform: string = "macOS"
) {
  return await testPrisma.connectionSession.create({
    data: {
      userId,
      sessionStart: new Date(),
      platform,
      serverLocation: "US",
      serverAddress: "192.168.1.1",
      appVersion: "1.0.0",
      subscriptionTier: "premium",
      bytesTransferred: BigInt(1024000),
      durationSeconds: 3600,
    },
  });
}

export function generateTestSessionToken(
  userId: string,
  email: string,
  provider?: "google" | "apple" | "firebase" | "demo"
): string {
  const payload: SessionTokenPayload = {
    userId,
    email,
    provider: (provider || "google") as
      | "google"
      | "apple"
      | "firebase"
      | "demo",
  };
  return generatePermanentSessionToken(payload);
}

export function generateValidAppleIdentityToken(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test" })
  ).toString("base64");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "https://appleid.apple.com",
      aud: "com.keenvpn.app",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      sub: "test-apple-user-id",
      email: "test@privaterelay.appleid.com",
      email_verified: "true",
    })
  ).toString("base64");
  const signature = Buffer.from("test-signature").toString("base64");

  return `${header}.${payload}.${signature}`;
}

export function generateInvalidToken(): string {
  return "invalid-token-" + faker.string.alphanumeric(20);
}

export function createMockStripeEvent(type: string, data: any) {
  return {
    id: `evt_${faker.string.alphanumeric(14)}`,
    object: "event",
    type,
    data: {
      object: data,
    },
    created: Math.floor(Date.now() / 1000),
  };
}

export async function createAppleIAPSubscription(userId: string) {
  return await testPrisma.subscription.create({
    data: {
      userId,
      status: "active",
      subscriptionType: "apple",
      appleTransactionId: `test_txn_${faker.string.alphanumeric(10)}`,
      appleOriginalTransactionId: `test_orig_${faker.string.alphanumeric(10)}`,
      appleProductId: "com.keenvpn.premium.annual",
      appleEnvironment: "sandbox",
      planName: "Premium VPN - Annual",
      priceAmount: 99.99,
      priceCurrency: "USD",
      billingPeriod: "yearly",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 31536000000),
      cancelAtPeriodEnd: false,
    },
  });
}
