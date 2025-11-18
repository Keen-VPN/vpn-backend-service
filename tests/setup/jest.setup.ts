import dotenv from "dotenv";
import path from "path";

// Set test environment FIRST before loading any other modules
process.env.NODE_ENV = "test";

// Load test environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

// Override DATABASE_URL to use direct PostgreSQL connection for tests
// Prisma Accelerate (Data Proxy) doesn't work well in test environments
if (process.env.DATABASE_URL?.startsWith("prisma+")) {
  // Extract the actual PostgreSQL URL from the commented line or use a default test DB
  // For local testing, use a direct PostgreSQL connection
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 
    "postgresql://keenvpn:keenvpn_test_password@localhost:5432/keenvpn_test?schema=public";
}

// Set required environment variables for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-key";
process.env.STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || "test-stripe-webhook-secret";
process.env.STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY || "test-stripe-secret-key";
process.env.STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID =
  process.env.STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID || "price_test_123";
process.env.STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID =
  process.env.STRIPE_INDIVIDUAL_MONTHLY_PRICE_ID || "price_test_123";

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
    // Try to decode the JWT
    try {
      const parts = token.split(".");
      if (parts.length === 3 && parts[1]) {
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64").toString("utf-8")
        );

        // Check if it's a Firebase token by looking at the issuer
        if (
          payload.iss &&
          (payload.iss.includes("securetoken.google.com") ||
            payload.iss.includes("firebase"))
        ) {
          return {
            uid: payload.uid || payload.sub,
            email: payload.email,
            name: payload.name,
            email_verified: payload.email_verified,
          };
        }
      }
    } catch (e) {
      // Not a valid JWT, try string matching for backward compatibility
    }

    // Fallback to string matching for simple test tokens
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

    // For any other token (including Google OAuth tokens), throw an error
    const error: any = new Error("Firebase ID token has invalid signature");
    error.code = "auth/argument-error";
    throw error;
  }),
  getUser: jest.fn(),
};

// Create auth function that returns the shared mock
const authFunction = () => sharedAuthMock;

// Mock Firebase Admin SDK globally before any imports
const firebaseAdminMock = {
  __esModule: true,
  default: {
    apps: [],
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
    },
    auth: authFunction,
  },
  auth: authFunction,
  apps: [],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
};

// Mock both the named import and default import
jest.mock("firebase-admin", () => firebaseAdminMock);

// Export the shared auth mock so it's accessible
export { sharedAuthMock };

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
          // Handle both Buffer and string payloads
          const payloadString = Buffer.isBuffer(payload)
            ? payload.toString()
            : payload;
          return JSON.parse(payloadString);
        }
      ),
    },
  },
}));

// Export Stripe mock for testing
export const stripeMock = jest.requireMock("../../src/config/stripe.js");
