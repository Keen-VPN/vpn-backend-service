import dotenv from "dotenv";
import path from "path";

// Set test environment FIRST before loading any other modules
process.env.NODE_ENV = "test";

// Load test environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

// Increase timeout for integration tests
jest.setTimeout(30000);

// Suppress console output during tests (optional)
if (process.env.SUPPRESS_LOGS === "true") {
  global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
}

// Create a single shared auth mock instance
const sharedAuthMock = {
  verifyIdToken: jest.fn(async (token: string) => {
    if (token === "valid-firebase-token") {
      return {
        uid: "firebase-test-uid-123",
        email: "firebase@example.com",
        name: "Firebase User",
        email_verified: true,
      };
    }
    if (token === "valid-apple-firebase-token") {
      return {
        uid: "apple-firebase-uid-123",
        email: "apple@privaterelay.appleid.com",
        name: "Apple User",
        email_verified: true,
      };
    }
    throw new Error("Invalid token");
  }),
  getUser: jest.fn(),
};

// Mock Firebase Admin SDK globally before any imports
const firebaseAdminMock = {
  __esModule: true,
  default: {
    apps: [],
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
    },
    auth: jest.fn(() => sharedAuthMock),
  },
  auth: jest.fn(() => sharedAuthMock),
  apps: [],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
};

jest.mock("firebase-admin", () => firebaseAdminMock);

// Mock global fetch for Google OAuth token verification and Apple IAP
global.fetch = jest.fn((url: string | URL | Request, options?: RequestInit) => {
  const urlString = url.toString();

  // Google OAuth token verification
  if (urlString.includes("oauth2.googleapis.com/tokeninfo")) {
    if (urlString.includes("valid-google-access-token")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          sub: "google-user-id-123",
          email: "google@example.com",
          name: "Google User",
          email_verified: "true",
        }),
      } as Response);
    }
    return Promise.resolve({
      ok: false,
      status: 401,
    } as Response);
  }

  // Apple IAP receipt verification
  if (
    urlString.includes("sandbox.itunes.apple.com") ||
    urlString.includes("buy.itunes.apple.com")
  ) {
    const body = options?.body ? JSON.parse(options.body as string) : {};
    const receiptData = body["receipt-data"];

    if (receiptData && receiptData.length > 0) {
      const responseData = {
        status: 0,
        environment: "Sandbox",
        receipt: {
          bundle_id: "com.keenvpn.app",
          in_app: [
            {
              transaction_id: "test_transaction_123",
              original_transaction_id: "test_original_123",
              product_id: "com.keenvpn.premium.annual",
              purchase_date_ms: Date.now().toString(),
              expires_date_ms: (Date.now() + 31536000000).toString(),
            },
          ],
        },
      };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => responseData,
      } as Response);
    }

    const errorData = { status: 21002 };
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => errorData,
    } as Response);
  }

  return Promise.reject(new Error("Unmocked fetch URL: " + urlString));
}) as jest.Mock;

// Mock Stripe
jest.mock("../../src/config/stripe.js", () => ({
  __esModule: true,
  default: {
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
      retrieve: jest.fn(async (customerId: string) => ({
        id: customerId,
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
        cancel_at_period_end: params.cancel_at_period_end || false,
      })),
      cancel: jest.fn(async () => ({
        id: "sub_test_mock_subscription",
        status: "canceled",
      })),
    },
    webhooks: {
      constructEvent: jest.fn(
        (payload: any, signature: string, _secret: string) => {
          if (signature !== "valid-stripe-signature") {
            throw new Error("Invalid signature");
          }
          return JSON.parse(payload.toString());
        }
      ),
    },
  },
}));
