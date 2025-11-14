import request from "supertest";
import { app } from "../../src/server.js";
import {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} from "../setup/test-db.js";
import { createTestUser, generateTestSessionToken } from "../setup/helpers.js";

// Mock node-fetch for Apple IAP verification
jest.mock("node-fetch", () =>
  jest.fn((url: string, options?: any) => {
    if (
      url.includes("sandbox.itunes.apple.com") ||
      url.includes("buy.itunes.apple.com")
    ) {
      const body = JSON.parse(options?.body || "{}");
      const receiptData = body["receipt-data"];

      if (receiptData && receiptData.length > 0) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
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
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: 21002,
        }),
      });
    }

    if (url.includes("oauth2.googleapis.com/tokeninfo")) {
      return Promise.resolve({
        ok: false,
        status: 401,
      });
    }

    return Promise.reject(new Error("Unknown URL"));
  })
);

describe("Apple IAP Routes Integration Tests", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
    jest.clearAllMocks();
  });

  describe("POST /api/apple-iap/link-purchase", () => {
    it("should successfully link valid Apple IAP purchase", async () => {
      const user = await createTestUser({
        provider: "apple",
      });
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        "apple"
      );

      const response = await request(app)
        .post("/api/apple-iap/link-purchase")
        .send({
          sessionToken,
          receiptData: "valid-receipt-data",
          transactionId: "test_transaction_123",
          originalTransactionId: "test_original_123",
          productId: "com.keenvpn.premium.annual",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.subscription).toBeDefined();
    });

    it("should return 400 for missing required fields", async () => {
      const user = await createTestUser({
        provider: "apple",
      });
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        "apple"
      );

      const response = await request(app)
        .post("/api/apple-iap/link-purchase")
        .send({
          sessionToken,
          transactionId: "test_transaction_123",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Missing required fields");
    });

    it("should return 401 for invalid session token", async () => {
      const response = await request(app)
        .post("/api/apple-iap/link-purchase")
        .send({
          sessionToken: "invalid-token",
          transactionId: "test_transaction_123",
          originalTransactionId: "test_original_123",
          productId: "com.keenvpn.premium.annual",
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should return 404 for non-existent user", async () => {
      const sessionToken = generateTestSessionToken(
        "non-existent-id",
        "test@example.com",
        "apple"
      );

      const response = await request(app)
        .post("/api/apple-iap/link-purchase")
        .send({
          sessionToken,
          transactionId: "test_transaction_123",
          originalTransactionId: "test_original_123",
          productId: "com.keenvpn.premium.annual",
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/apple-iap/check-status", () => {
    it("should retrieve user Apple IAP subscription", async () => {
      const user = await createTestUser({
        provider: "apple",
      });
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        "apple"
      );

      // First link a purchase
      const linkResponse = await request(app)
        .post("/api/apple-iap/link-purchase")
        .send({
          sessionToken,
          receiptData: "valid-receipt-data",
          transactionId: "test_transaction_123",
          originalTransactionId: "test_original_123",
          productId: "com.keenvpn.premium.annual",
        });

      expect(linkResponse.status).toBe(200);
      expect(linkResponse.body.success).toBe(true);

      // Then check status
      const response = await request(app)
        .post("/api/apple-iap/check-status")
        .send({
          sessionToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.hasSubscription).toBe(true);
      expect(response.body.subscription).toBeDefined();
    });

    it("should return null for user without Apple IAP subscription", async () => {
      const user = await createTestUser({
        provider: "apple",
      });
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        "apple"
      );

      const response = await request(app)
        .post("/api/apple-iap/check-status")
        .send({
          sessionToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.hasSubscription).toBe(false);
    });

    it("should return 400 for missing session token", async () => {
      const response = await request(app)
        .post("/api/apple-iap/check-status")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should return 401 for invalid session token", async () => {
      const response = await request(app)
        .post("/api/apple-iap/check-status")
        .send({
          sessionToken: "invalid-token",
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/apple-iap/restore", () => {
    it("should restore Apple IAP purchases from receipt", async () => {
      const user = await createTestUser({
        provider: "apple",
      });
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        "apple"
      );

      const response = await request(app).post("/api/apple-iap/restore").send({
        sessionToken,
        receiptData: "valid-receipt-data",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain("Restored");
    });

    it("should return 400 for missing required fields", async () => {
      const user = await createTestUser({
        provider: "apple",
      });
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        "apple"
      );

      const response = await request(app).post("/api/apple-iap/restore").send({
        sessionToken,
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("required");
    });

    it("should return 401 for invalid session token", async () => {
      const response = await request(app).post("/api/apple-iap/restore").send({
        sessionToken: "invalid-token",
        receiptData: "valid-receipt-data",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/apple-iap/sync-status", () => {
    it("should sync Apple IAP subscription status", async () => {
      const user = await createTestUser({
        provider: "apple",
      });
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        "apple"
      );

      const response = await request(app)
        .post("/api/apple-iap/sync-status")
        .send({
          sessionToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.hasSubscription).toBe(false);
    });

    it("should return 400 for missing session token", async () => {
      const response = await request(app)
        .post("/api/apple-iap/sync-status")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should return 401 for invalid session token", async () => {
      const response = await request(app)
        .post("/api/apple-iap/sync-status")
        .send({
          sessionToken: "invalid-token",
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
