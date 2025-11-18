import request from "supertest";
import { app } from "../../src/server.js";
import {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} from "../setup/test-db.js";
import {
  createTestUser,
  createTestConnectionSession,
} from "../setup/helpers.js";

describe("Connection Routes Integration Tests", () => {
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
  });

  describe("POST /api/connection/session", () => {
    it("should successfully create a connection session", async () => {
      const user = await createTestUser();

      const response = await request(app).post("/api/connection/session").send({
        firebase_uid: user.firebaseUid,
        email: user.email,
        session_start: new Date().toISOString(),
        duration_seconds: 3600,
        platform: "macOS",
        app_version: "1.0.0",
        server_location: "US",
        server_address: "192.168.1.1",
        subscription_tier: "premium",
        bytes_transferred: 1024000,
        termination_reason: "USER_TERMINATION",
        event_type: "SESSION_END",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.session_id).toBeDefined();
      expect(response.body.data.platform).toBe("macOS");
    });

    it("should create session with SESSION_START event type", async () => {
      const user = await createTestUser();

      const response = await request(app).post("/api/connection/session").send({
        firebase_uid: user.firebaseUid,
        email: user.email,
        session_start: new Date().toISOString(),
        duration_seconds: 0,
        platform: "iOS",
        event_type: "SESSION_START",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.session_id).toBeDefined();
      expect(response.body.data.platform).toBe("iOS");
    });

    it("should handle HEARTBEAT event type", async () => {
      const user = await createTestUser();

      const response = await request(app).post("/api/connection/session").send({
        firebase_uid: user.firebaseUid,
        email: user.email,
        session_start: new Date().toISOString(),
        duration_seconds: 1800,
        platform: "Android",
        event_type: "HEARTBEAT",
        heartbeat_timestamp: new Date().toISOString(),
        bytes_transferred: 512000,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should return 400 for missing required fields", async () => {
      const response = await request(app).post("/api/connection/session").send({
        platform: "macOS",
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Missing required fields");
    });

    it("should return 400 for invalid termination_reason", async () => {
      const user = await createTestUser();

      const response = await request(app).post("/api/connection/session").send({
        firebase_uid: user.firebaseUid,
        email: user.email,
        session_start: new Date().toISOString(),
        duration_seconds: 3600,
        platform: "macOS",
        termination_reason: "INVALID_REASON",
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Invalid termination_reason");
    });

    it("should return 400 for invalid event_type", async () => {
      const user = await createTestUser();

      const response = await request(app).post("/api/connection/session").send({
        firebase_uid: user.firebaseUid,
        email: user.email,
        session_start: new Date().toISOString(),
        duration_seconds: 3600,
        platform: "macOS",
        event_type: "INVALID_EVENT",
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Invalid event_type");
    });

    it("should return 400 for non-existent user", async () => {
      const response = await request(app).post("/api/connection/session").send({
        firebase_uid: "new-firebase-uid",
        email: "newuser@example.com",
        session_start: new Date().toISOString(),
        duration_seconds: 3600,
        platform: "Web",
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("User not found");
    });

    it("should handle large bytes_transferred values", async () => {
      const user = await createTestUser();

      const response = await request(app).post("/api/connection/session").send({
        firebase_uid: user.firebaseUid,
        email: user.email,
        session_start: new Date().toISOString(),
        duration_seconds: 7200,
        platform: "macOS",
        bytes_transferred: "999999999999",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /api/connection/sessions/:identifier", () => {
    it("should retrieve user connection sessions", async () => {
      const user = await createTestUser();
      await createTestConnectionSession(user.id, "macOS");
      await createTestConnectionSession(user.id, "iOS");

      const response = await request(app).get(
        `/api/connection/sessions/${user.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(2);
    });

    it("should return empty array for user with no sessions", async () => {
      const user = await createTestUser();

      const response = await request(app).get(
        `/api/connection/sessions/${user.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it("should support pagination with limit parameter", async () => {
      const user = await createTestUser();
      await createTestConnectionSession(user.id, "macOS");
      await createTestConnectionSession(user.id, "iOS");
      await createTestConnectionSession(user.id, "Android");

      const response = await request(app)
        .get(`/api/connection/sessions/${user.id}`)
        .query({ limit: 2 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
    });

    it("should return 404 for non-existent user", async () => {
      const response = await request(app).get(
        "/api/connection/sessions/non-existent-id"
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("GET /api/connection/stats/:identifier", () => {
    it("should return connection statistics for user", async () => {
      const user = await createTestUser();
      await createTestConnectionSession(user.id, "macOS");
      await createTestConnectionSession(user.id, "iOS");

      const response = await request(app).get(
        `/api/connection/stats/${user.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.total_sessions).toBe(2);
      expect(response.body.data.total_duration_seconds).toBeGreaterThan(0);
      expect(response.body.data.total_bytes_transferred).toBeDefined();
    });

    it("should return zero stats for user with no sessions", async () => {
      const user = await createTestUser();

      const response = await request(app).get(
        `/api/connection/stats/${user.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.total_sessions).toBe(0);
      expect(response.body.data.total_duration_seconds).toBe(0);
    });

    it("should aggregate data by platform", async () => {
      const user = await createTestUser();
      await createTestConnectionSession(user.id, "macOS");
      await createTestConnectionSession(user.id, "macOS");
      await createTestConnectionSession(user.id, "iOS");

      const response = await request(app).get(
        `/api/connection/stats/${user.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.platform_breakdown).toBeDefined();
    });

    it("should return 404 for non-existent user", async () => {
      const response = await request(app).get(
        "/api/connection/stats/non-existent-id"
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});
