import request from "supertest";
import crypto from "crypto";
import { app } from "../../src/server.js";
import {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} from "../setup/test-db.js";
import { createTestUser, generateTestSessionToken } from "../setup/helpers.js";

describe("Desktop Auth Routes Integration Tests", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  describe("POST /api/desktop-auth/generate-code", () => {
    it("should generate one-time code for valid session token", async () => {
      const user = await createTestUser();
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        user.provider as "google" | "apple" | "firebase" | "demo"
      );
      const codeChallenge = crypto.randomBytes(32).toString("base64url");

      const response = await request(app)
        .post("/api/desktop-auth/generate-code")
        .send({
          sessionToken,
          codeChallenge,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.code).toBeDefined();
      expect(response.body.deepLink).toBeDefined();
      expect(response.body.deepLink).toContain("vpnkeen://auth/callback?code=");
    });

    it("should generate code with deviceId", async () => {
      const user = await createTestUser();
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        user.provider as "google" | "apple" | "firebase" | "demo"
      );
      const codeChallenge = crypto.randomBytes(32).toString("base64url");
      const deviceId = "test-device-123";

      const response = await request(app)
        .post("/api/desktop-auth/generate-code")
        .send({
          sessionToken,
          codeChallenge,
          deviceId,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.code).toBeDefined();
    });

    it("should return 400 for missing sessionToken", async () => {
      const codeChallenge = crypto.randomBytes(32).toString("base64url");

      const response = await request(app)
        .post("/api/desktop-auth/generate-code")
        .send({
          codeChallenge,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Missing required fields");
    });

    it("should return 400 for missing codeChallenge", async () => {
      const user = await createTestUser();
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        user.provider as "google" | "apple" | "firebase" | "demo"
      );

      const response = await request(app)
        .post("/api/desktop-auth/generate-code")
        .send({
          sessionToken,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Missing required fields");
    });

    it("should return 401 for invalid session token", async () => {
      const codeChallenge = crypto.randomBytes(32).toString("base64url");

      const response = await request(app)
        .post("/api/desktop-auth/generate-code")
        .send({
          sessionToken: "invalid-token",
          codeChallenge,
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Invalid session token");
    });
  });

  describe("POST /api/desktop-auth/exchange", () => {
    it("should exchange valid code for session token", async () => {
      const user = await createTestUser();
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        user.provider as "google" | "apple" | "firebase" | "demo"
      );
      const codeVerifier = crypto.randomBytes(32).toString("base64url");
      const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

      const generateResponse = await request(app)
        .post("/api/desktop-auth/generate-code")
        .send({
          sessionToken,
          codeChallenge,
        });

      const { code } = generateResponse.body;

      const exchangeResponse = await request(app)
        .post("/api/desktop-auth/exchange")
        .send({
          code,
          codeVerifier,
        });

      expect(exchangeResponse.status).toBe(200);
      expect(exchangeResponse.body.success).toBe(true);
      expect(exchangeResponse.body.access_token).toBeDefined();
      expect(exchangeResponse.body.user).toBeDefined();
      expect(exchangeResponse.body.user.id).toBe(user.id);
    });

    it("should return 400 for missing code", async () => {
      const codeVerifier = crypto.randomBytes(32).toString("base64url");

      const response = await request(app)
        .post("/api/desktop-auth/exchange")
        .send({
          codeVerifier,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Missing required fields");
    });

    it("should return 400 for missing codeVerifier", async () => {
      const response = await request(app)
        .post("/api/desktop-auth/exchange")
        .send({
          code: "test-code",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Missing required fields");
    });

    it("should return 401 for invalid code", async () => {
      const codeVerifier = crypto.randomBytes(32).toString("base64url");

      const response = await request(app)
        .post("/api/desktop-auth/exchange")
        .send({
          code: "invalid-code",
          codeVerifier,
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Invalid or expired code");
    });

    it("should return 401 for incorrect codeVerifier", async () => {
      const user = await createTestUser();
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        user.provider as "google" | "apple" | "firebase" | "demo"
      );
      const codeVerifier = crypto.randomBytes(32).toString("base64url");
      const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

      const generateResponse = await request(app)
        .post("/api/desktop-auth/generate-code")
        .send({
          sessionToken,
          codeChallenge,
        });

      const { code } = generateResponse.body;

      const wrongVerifier = crypto.randomBytes(32).toString("base64url");

      const exchangeResponse = await request(app)
        .post("/api/desktop-auth/exchange")
        .send({
          code,
          codeVerifier: wrongVerifier,
        });

      expect(exchangeResponse.status).toBe(401);
      expect(exchangeResponse.body.success).toBe(false);
      expect(exchangeResponse.body.error).toContain("Invalid code verifier");
    });

    it("should invalidate code after successful exchange", async () => {
      const user = await createTestUser();
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        user.provider as "google" | "apple" | "firebase" | "demo"
      );
      const codeVerifier = crypto.randomBytes(32).toString("base64url");
      const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

      const generateResponse = await request(app)
        .post("/api/desktop-auth/generate-code")
        .send({
          sessionToken,
          codeChallenge,
        });

      const { code } = generateResponse.body;

      await request(app).post("/api/desktop-auth/exchange-code").send({
        code,
        codeVerifier,
      });

      const secondExchange = await request(app)
        .post("/api/desktop-auth/exchange")
        .send({
          code,
          codeVerifier,
        });

      expect(secondExchange.status).toBe(401);
      expect(secondExchange.body.success).toBe(false);
    });

    it("should include subscription data if user has active subscription", async () => {
      const user = await createTestUser();
      const sessionToken = generateTestSessionToken(
        user.id,
        user.email,
        user.provider as "google" | "apple" | "firebase" | "demo"
      );
      const codeVerifier = crypto.randomBytes(32).toString("base64url");
      const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

      // Import and use subscription helper
      const { createTestSubscription } = await import("../setup/helpers.js");
      await createTestSubscription({
        userId: user.id,
        status: "active",
      });

      const generateResponse = await request(app)
        .post("/api/desktop-auth/generate-code")
        .send({
          sessionToken,
          codeChallenge,
        });

      const { code } = generateResponse.body;

      const exchangeResponse = await request(app)
        .post("/api/desktop-auth/exchange")
        .send({
          code,
          codeVerifier,
        });

      expect(exchangeResponse.status).toBe(200);
      expect(exchangeResponse.body.success).toBe(true);
      expect(exchangeResponse.body.access_token).toBeDefined();
      expect(exchangeResponse.body.refresh_token).toBeDefined();
      expect(exchangeResponse.body.user).toBeDefined();
      expect(exchangeResponse.body.user.email).toBe(user.email);
    });
  });
});
