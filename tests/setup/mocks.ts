import { jest } from "@jest/globals";

export const mockFirebaseAdmin = {
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(async (token: string) => {
      if (token === "valid-firebase-token") {
        return {
          uid: "firebase-test-uid",
          email: "test@example.com",
          name: "Test User",
          email_verified: true,
        };
      }
      if (token === "valid-apple-firebase-token") {
        return {
          uid: "apple-firebase-uid",
          email: "test@privaterelay.appleid.com",
          name: "Apple User",
          email_verified: true,
        };
      }
      throw new Error("Invalid token");
    }),
  })),
};

export const mockStripe = {
  checkout: {
    sessions: {
      create: jest.fn(async () => ({
        id: "cs_test_mock_session_id",
        url: "https://checkout.stripe.com/test-session",
      })),
      retrieve: jest.fn(async () => ({
        id: "cs_test_mock_session_id",
        customer: "cus_test_mock_customer",
        subscription: "sub_test_mock_subscription",
        payment_status: "paid",
      })),
    },
  },
  customers: {
    create: jest.fn(async () => ({
      id: "cus_test_mock_customer",
    })),
    retrieve: jest.fn(async () => ({
      id: "cus_test_mock_customer",
      email: "test@example.com",
    })),
  },
  subscriptions: {
    retrieve: jest.fn(async () => ({
      id: "sub_test_mock_subscription",
      status: "active",
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 31536000,
      cancel_at_period_end: false,
    })),
    update: jest.fn(async (_id: string, params: any) => ({
      id: "sub_test_mock_subscription",
      cancel_at_period_end: params.cancel_at_period_end,
    })),
    cancel: jest.fn(async () => ({
      id: "sub_test_mock_subscription",
      status: "canceled",
    })),
  },
  webhooks: {
    constructEvent: jest.fn(
      (payload: any, signature: string, secret: string) => {
        if (signature !== "valid-stripe-signature") {
          throw new Error("Invalid signature");
        }
        return JSON.parse(payload.toString());
      }
    ),
  },
};

export const mockAppleIAPVerification = {
  verifyReceipt: jest.fn(async (receiptData: string, environment: string) => {
    if (receiptData === "valid-receipt") {
      return {
        status: 0,
        receipt: {
          bundle_id: "com.keenvpn.app",
        },
        latest_receipt_info: [
          {
            transaction_id: "test_transaction_123",
            original_transaction_id: "test_original_123",
            product_id: "com.keenvpn.premium.annual",
            purchase_date_ms: Date.now().toString(),
            expires_date_ms: (Date.now() + 31536000000).toString(),
          },
        ],
      };
    }
    return {
      status: 21002,
    };
  }),
};

export const mockGoogleOAuthVerification = {
  verifyAccessToken: jest.fn(async (token: string) => {
    if (token === "valid-google-access-token") {
      return {
        sub: "google-user-id-123",
        email: "google@example.com",
        name: "Google User",
        verified_email: true,
      };
    }
    throw new Error("Invalid token");
  }),
};

export function setupMocks(): void {
  jest.mock("firebase-admin", () => mockFirebaseAdmin);
  jest.mock("../../src/config/stripe.js", () => ({ default: mockStripe }));
}

export function resetAllMocks(): void {
  jest.clearAllMocks();
}
