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
  generateValidAppleIdentityToken,
  generateValidAppleFirebaseToken,
  generateInvalidToken,
} from "../setup/helpers.js";

// Mock node-fetch for Google OAuth verification
jest.mock("node-fetch", () =>
  jest.fn((url: string) => {
    if (url.includes("oauth2.googleapis.com/tokeninfo")) {
      const token = url.split("access_token=")[1];
      if (token === "valid-google-access-token") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            sub: "google-user-id-123",
            email: "google@example.com",
            name: "Google User",
            verified_email: true,
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 401,
      });
    }
    return Promise.reject(new Error("Unknown URL"));
  })
);

describe("Auth Routes Integration Tests", () => {
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      await setupTestDatabase();
      dbAvailable = true;
    } catch (error: any) {
      if (error.message === "DATABASE_UNAVAILABLE") {
        console.warn("⚠️  Skipping tests - database not available");
        dbAvailable = false;
        return;
      }
      throw error;
    }
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    if (!dbAvailable) {
      return; // Skip if DB is not available
    }
    await cleanupTestDatabase();
    // Clear blacklist
    global.deletedAppleUsers = new Map();
    global.deletedGoogleUsers = new Map();
    global.deletedFirebaseUsers = new Map();
  });

  describe("POST /api/auth/apple/signin", () => {
    it("should successfully sign in with valid Apple token (new user)", async () => {
      const response = await request(app).post("/api/auth/apple/signin").send({
        identityToken: generateValidAppleIdentityToken(),
        userIdentifier: "test-apple-user-id",
        email: "test@privaterelay.appleid.com",
        fullName: "Apple Test User",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe("test@privaterelay.appleid.com");
      expect(response.body.sessionToken).toBeDefined();
      expect(response.body.authMethod).toBe("apple");
    });

    it("should successfully sign in with valid Firebase Apple token (existing user)", async () => {
      // The mock returns uid: "apple-firebase-uid-123" for a proper Firebase JWT
      const existingUser = await createTestUser({
        firebaseUid: "apple-firebase-uid-123",
        appleUserId: "apple-user-id",
        email: "apple@privaterelay.appleid.com",
        provider: "apple",
      });

      const response = await request(app).post("/api/auth/apple/signin").send({
        identityToken: generateValidAppleFirebaseToken(),
        userIdentifier: "apple-user-id",
        email: "apple@privaterelay.appleid.com",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.id).toBe(existingUser.id);
    });

    it("should return 400 for missing identity token", async () => {
      const response = await request(app).post("/api/auth/apple/signin").send({
        userIdentifier: "test-user-id",
        email: "test@example.com",
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("identityToken");
    });

    it("should return 401 for invalid token", async () => {
      const response = await request(app).post("/api/auth/apple/signin").send({
        identityToken: generateInvalidToken(),
        userIdentifier: "test-user-id",
        email: "test@example.com",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should return 403 for blacklisted user (recently deleted)", async () => {
      // The generateValidAppleIdentityToken() creates a token with sub: "test-apple-user-id"
      // So we need to match the firebaseUid that would be generated: "apple_test-apple-user-id"
      const appleUserId = "test-apple-user-id";
      const firebaseUid = `apple_${appleUserId}`;

      global.deletedFirebaseUsers?.set(firebaseUid, {
        userId: "test-id",
        firebaseUid,
        appleUserId,
        email: "blacklisted@test.com",
        deletedAt: new Date().toISOString(),
      });

      global.deletedAppleUsers?.set(appleUserId, {
        userId: "test-id",
        firebaseUid,
        appleUserId,
        email: "blacklisted@test.com",
        deletedAt: new Date().toISOString(),
      });

      const response = await request(app).post("/api/auth/apple/signin").send({
        identityToken: generateValidAppleIdentityToken(),
        userIdentifier: appleUserId,
        email: "test@privaterelay.appleid.com",
      });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.accountDeleted).toBe(true);
      expect(response.body.minutesRemaining).toBeDefined();
    });
  });

  describe("POST /api/auth/google/signin", () => {
    it("should return 400 for missing idToken", async () => {
      const response = await request(app)
        .post("/api/auth/google/signin")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("idToken");
    });

    it("should return 401 for invalid token", async () => {
      const response = await request(app).post("/api/auth/google/signin").send({
        idToken: generateInvalidToken(),
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/auth/verify", () => {
    it("should successfully verify valid session token", async () => {
      const user = await createTestUser();
      const sessionToken = generateTestSessionToken(user.id, user.email);

      const response = await request(app).post("/api/auth/verify").send({
        sessionToken,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.id).toBe(user.id);
      expect(response.body.user.email).toBe(user.email);
    });

    it("should return subscription data if user has active subscription", async () => {
      const user = await createTestUser();
      await createTestSubscription({
        userId: user.id,
        status: "active",
      });
      const sessionToken = generateTestSessionToken(user.id, user.email);

      const response = await request(app).post("/api/auth/verify").send({
        sessionToken,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.subscription).toBeDefined();
      expect(response.body.subscription.status).toBe("active");
    });

    it("should return 400 for missing session token", async () => {
      const response = await request(app).post("/api/auth/verify").send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("sessionToken");
    });

    it("should return 401 for invalid session token", async () => {
      const response = await request(app).post("/api/auth/verify").send({
        sessionToken: generateInvalidToken(),
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Invalid or expired");
    });

    it("should return 404 if user not found", async () => {
      const sessionToken = generateTestSessionToken(
        "non-existent-id",
        "test@example.com",
        "google"
      );

      const response = await request(app).post("/api/auth/verify").send({
        sessionToken,
      });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("User not found");
    });
  });

  describe("DELETE /api/auth/delete-account", () => {
    it("should successfully delete user account", async () => {
      const user = await createTestUser();

      const response = await request(app)
        .delete("/api/auth/delete-account")
        .send({
          email: user.email,
          userId: user.id,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain("deleted successfully");
    });

    it("should delete user account with cascading subscriptions and sessions", async () => {
      const user = await createTestUser();
      await createTestSubscription({ userId: user.id });

      const response = await request(app)
        .delete("/api/auth/delete-account")
        .send({
          email: user.email,
          userId: user.id,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should add user to blacklist after deletion", async () => {
      const user = await createTestUser({
        firebaseUid: "test-firebase-uid",
      });

      await request(app).delete("/api/auth/delete-account").send({
        email: user.email,
        userId: user.id,
      });

      expect(global.deletedFirebaseUsers?.has("test-firebase-uid")).toBe(true);
    });

    it("should return 400 for missing required fields", async () => {
      const response = await request(app)
        .delete("/api/auth/delete-account")
        .send({
          email: "test@example.com",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Missing required fields");
    });

    it("should return 404 if user not found", async () => {
      const response = await request(app)
        .delete("/api/auth/delete-account")
        .send({
          email: "nonexistent@example.com",
          userId: "non-existent-id",
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it("should return 400 for email mismatch (non-Apple users)", async () => {
      const user = await createTestUser({
        email: "correct@example.com",
        provider: "google",
      });

      const response = await request(app)
        .delete("/api/auth/delete-account")
        .send({
          email: "wrong@example.com",
          userId: user.id,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Email does not match");
    });

    it("should skip email verification for Apple private relay users", async () => {
      const user = await createTestUser({
        email: "test@privaterelay.appleid.com",
        provider: "apple",
      });

      const response = await request(app)
        .delete("/api/auth/delete-account")
        .send({
          email: "different@privaterelay.appleid.com",
          userId: user.id,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
