import request from "supertest";
import { app } from "../../src/server.js";
import {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} from "../setup/test-db.js";
import {
  createTestUser,
  createTestSubscription,
  generateTestSessionToken,
  createMockStripeEvent,
} from "../setup/helpers.js";

// Mock Stripe
jest.mock("../../src/config/stripe.js", () => ({
  default: {
    checkout: {
      sessions: {
        create: jest.fn(async () => ({
          id: "cs_test_mock_session_id",
          url: "https://checkout.stripe.com/test-session",
        })),
      },
    },
    customers: {
      create: jest.fn(async () => ({
        id: "cus_test_mock_customer",
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

describe("Subscription Routes Integration Tests", () => {
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

  describe("GET /api/subscription/plans", () => {
    it("should return available subscription plans", async () => {
      const response = await request(app).get("/api/subscription/plans");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.plans).toBeDefined();
      expect(Array.isArray(response.body.data.plans)).toBe(true);
      expect(response.body.data.plans.length).toBeGreaterThan(0);
    });

    it("should return plan with correct structure", async () => {
      const response = await request(app).get("/api/subscription/plans");

      const plan = response.body.data.plans[0];
      expect(plan).toHaveProperty("id");
      expect(plan).toHaveProperty("name");
      expect(plan).toHaveProperty("price");
      expect(plan).toHaveProperty("period");
      expect(plan).toHaveProperty("features");
      expect(Array.isArray(plan.features)).toBe(true);
    });
  });

  describe("POST /api/subscription/status-session", () => {
    it("should return subscription status for user with active subscription", async () => {
      const user = await createTestUser();
      await createTestSubscription({
        userId: user.id,
        status: "active",
      });
      const sessionToken = generateTestSessionToken(user.id, user.email);

      const response = await request(app)
        .post("/api/subscription/status-session")
        .send({
          sessionToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.subscription).toBeDefined();
      expect(response.body.subscription.status).toBe("active");
      expect(response.body.hasActiveSubscription).toBe(true);
    });

    it("should return no subscription for user without subscription", async () => {
      const user = await createTestUser();
      const sessionToken = generateTestSessionToken(user.id, user.email);

      const response = await request(app)
        .post("/api/subscription/status-session")
        .send({
          sessionToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.hasActiveSubscription).toBe(false);
    });

    it("should return 400 for missing session token", async () => {
      const response = await request(app)
        .post("/api/subscription/status-session")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Session token");
    });

    it("should return 401 for invalid session token", async () => {
      const response = await request(app)
        .post("/api/subscription/status-session")
        .send({
          sessionToken: "invalid-token",
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Invalid session token");
    });

    it("should return 404 for non-existent user", async () => {
      const sessionToken = generateTestSessionToken(
        "non-existent-id",
        "test@example.com",
        "google"
      );

      const response = await request(app)
        .post("/api/subscription/status-session")
        .send({
          sessionToken,
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/subscription/cancel", () => {
    it("should successfully cancel active subscription", async () => {
      const user = await createTestUser();
      await createTestSubscription({
        userId: user.id,
        status: "active",
        stripeSubscriptionId: "sub_test_mock_subscription",
      });
      const sessionToken = generateTestSessionToken(user.id, user.email);

      const response = await request(app)
        .post("/api/subscription/cancel")
        .send({
          sessionToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain("cancelled");
    });

    it("should return 401 for missing session token", async () => {
      const response = await request(app)
        .post("/api/subscription/cancel")
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should return 404 if user has no active subscription", async () => {
      const user = await createTestUser();
      const sessionToken = generateTestSessionToken(user.id, user.email);

      const response = await request(app)
        .post("/api/subscription/cancel")
        .send({
          sessionToken,
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("No active subscription");
    });
  });

  describe("POST /api/subscription/webhook", () => {
    it("should handle checkout.session.completed event", async () => {
      const user = await createTestUser();

      const event = createMockStripeEvent("checkout.session.completed", {
        id: "cs_test_123",
        customer: "cus_test_123",
        subscription: "sub_test_123",
        customer_email: user.email,
        metadata: {
          userId: user.id,
        },
      });

      const response = await request(app)
        .post("/api/subscription/webhook")
        .set("stripe-signature", "valid-stripe-signature")
        .send(JSON.stringify(event));

      expect(response.status).toBe(200);
    });

    it("should handle customer.subscription.created event", async () => {
      const user = await createTestUser();

      // Update user with stripe customer ID
      const { testPrisma } = await import("../setup/test-db.js");
      await testPrisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: "cus_test_123" },
      });

      const event = createMockStripeEvent("customer.subscription.created", {
        id: "sub_test_123",
        customer: "cus_test_123",
        status: "active",
        items: {
          data: [
            {
              price: {
                id: "price_test_123",
                unit_amount: 10000,
                currency: "usd",
                recurring: {
                  interval: "year",
                },
              },
            },
          ],
        },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 31536000,
      });

      const response = await request(app)
        .post("/api/subscription/webhook")
        .set("stripe-signature", "valid-stripe-signature")
        .send(JSON.stringify(event));

      expect(response.status).toBe(200);
    });

    it("should handle customer.subscription.updated event", async () => {
      const user = await createTestUser();

      // Update user with stripe customer ID
      const { testPrisma } = await import("../setup/test-db.js");
      await testPrisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: "cus_test_123" },
      });

      await createTestSubscription({
        userId: user.id,
        stripeSubscriptionId: "sub_test_123",
      });

      const event = createMockStripeEvent("customer.subscription.updated", {
        id: "sub_test_123",
        customer: "cus_test_123",
        status: "active",
        cancel_at_period_end: true,
      });

      const response = await request(app)
        .post("/api/subscription/webhook")
        .set("stripe-signature", "valid-stripe-signature")
        .send(JSON.stringify(event));

      expect(response.status).toBe(200);
    });

    it("should handle customer.subscription.deleted event", async () => {
      const user = await createTestUser();

      // Update user with stripe customer ID
      const { testPrisma } = await import("../setup/test-db.js");
      await testPrisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: "cus_test_123" },
      });

      await createTestSubscription({
        userId: user.id,
        stripeSubscriptionId: "sub_test_123",
      });

      const event = createMockStripeEvent("customer.subscription.deleted", {
        id: "sub_test_123",
        customer: "cus_test_123",
      });

      const response = await request(app)
        .post("/api/subscription/webhook")
        .set("stripe-signature", "valid-stripe-signature")
        .send(JSON.stringify(event));

      expect(response.status).toBe(200);
    });

    it("should return 400 for invalid signature", async () => {
      const event = createMockStripeEvent("checkout.session.completed", {});

      const response = await request(app)
        .post("/api/subscription/webhook")
        .set("stripe-signature", "invalid-signature")
        .send(JSON.stringify(event));

      expect(response.status).toBe(400);
    });

    it("should handle unhandled event types gracefully", async () => {
      const event = createMockStripeEvent("customer.created", {
        id: "cus_test_123",
      });

      const response = await request(app)
        .post("/api/subscription/webhook")
        .set("stripe-signature", "valid-stripe-signature")
        .send(JSON.stringify(event));

      expect(response.status).toBe(200);
    });
  });
});
