import express, { Request, Response, Router } from "express";
import User from "../models/User.js";
import ConnectionSession from "../models/ConnectionSession.js";
import type {
  ApiResponse,
  TerminationReason,
  EventType,
} from "../types/index.js";

const router: Router = express.Router();

// Record a connection session
router.post("/session", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      firebase_uid,
      email,
      session_start,
      session_end,
      duration_seconds,
      platform,
      app_version,
      server_location,
      server_address,
      subscription_tier,
      bytes_transferred,
      termination_reason,
      event_type,
      heartbeat_timestamp,
    } = req.body;

    // Validate required fields
    if (!session_start || !duration_seconds || !platform) {
      console.error("❌ Invalid payload - Missing required fields:", {
        session_start: !!session_start,
        duration_seconds: !!duration_seconds,
        platform: !!platform,
        received_body: JSON.stringify(req.body),
      });
      res.status(400).json({
        success: false,
        error:
          "Missing required fields: session_start, duration_seconds, platform",
      } as ApiResponse);
      return;
    }

    // Validate termination_reason if provided
    if (
      termination_reason &&
      !["USER_TERMINATION", "CONNECTION_LOST"].includes(termination_reason)
    ) {
      console.error("❌ Invalid payload - Invalid termination_reason:", {
        provided_value: termination_reason,
        allowed_values: ["USER_TERMINATION", "CONNECTION_LOST"],
        received_body: JSON.stringify(req.body),
      });
      res.status(400).json({
        success: false,
        error:
          'Invalid termination_reason. Must be either "USER_TERMINATION" or "CONNECTION_LOST"',
      } as ApiResponse);
      return;
    }

    // Validate event_type if provided
    if (
      event_type &&
      !["SESSION_START", "HEARTBEAT", "SESSION_END"].includes(event_type)
    ) {
      console.error("❌ Invalid payload - Invalid event_type:", {
        provided_value: event_type,
        allowed_values: ["SESSION_START", "HEARTBEAT", "SESSION_END"],
        received_body: JSON.stringify(req.body),
      });
      res.status(400).json({
        success: false,
        error:
          'Invalid event_type. Must be one of: "SESSION_START", "HEARTBEAT", "SESSION_END"',
      } as ApiResponse);
      return;
    }

    // Validate heartbeat_timestamp for heartbeat events
    if (event_type === "HEARTBEAT" && !heartbeat_timestamp) {
      console.error(
        "❌ Invalid payload - Missing heartbeat_timestamp for HEARTBEAT event:",
        {
          event_type: event_type,
          heartbeat_timestamp: heartbeat_timestamp,
          received_body: JSON.stringify(req.body),
        }
      );
      res.status(400).json({
        success: false,
        error: 'heartbeat_timestamp is required when event_type is "HEARTBEAT"',
      } as ApiResponse);
      return;
    }

    // Validate heartbeat_timestamp format if provided
    if (heartbeat_timestamp && isNaN(new Date(heartbeat_timestamp).getTime())) {
      console.error(
        "❌ Invalid payload - Invalid heartbeat_timestamp format:",
        {
          provided_value: heartbeat_timestamp,
          expected_format: "ISO 8601 date string",
          received_body: JSON.stringify(req.body),
        }
      );
      res.status(400).json({
        success: false,
        error:
          "Invalid heartbeat_timestamp format. Must be a valid ISO 8601 date string",
      } as ApiResponse);
      return;
    }

    // Find user
    const userModel = new User();
    let user = null;

    if (email && email.trim() !== "") {
      console.log(`🔍 Looking up user by email: ${email}`);
      user = await userModel.findByEmail(email);
      if (user) {
        console.log(`✅ User found by email: ${user.id}`);
      }
    }

    if (!user && firebase_uid && firebase_uid.trim() !== "") {
      console.log(`🔍 Looking up user by firebase_uid: ${firebase_uid}`);
      user = await userModel.findByFirebaseUid(firebase_uid);
      if (user) {
        console.log(`✅ User found by firebase_uid: ${user.id}`);
      }
    }

    if (!user) {
      console.error(
        "❌ User lookup failed - cannot record session without user ID"
      );
      res.status(400).json({
        success: false,
        error: "User not found. Please ensure you are properly authenticated.",
      } as ApiResponse);
      return;
    }

    // Create connection session using model (privacy-preserving)
    const sessionModel = new ConnectionSession();
    const session = await sessionModel.create({
      userId: user.id,
      sessionStart: new Date(session_start),
      sessionEnd: session_end ? new Date(session_end) : undefined,
      durationSeconds: duration_seconds,
      serverLocation: server_location,
      serverAddress: server_address, // For troubleshooting only, will be anonymized
      platform: platform,
      appVersion: app_version,
      bytesTransferred: bytes_transferred || 0,
      subscriptionTier: subscription_tier || "free",
      terminationReason:
        (termination_reason as TerminationReason) || "USER_TERMINATION", // Default to user termination if not provided
      eventType: (event_type as EventType) || "SESSION_START", // Default to session start if not provided
      heartbeatTimestamp: heartbeat_timestamp
        ? new Date(heartbeat_timestamp)
        : null,
    });

    console.log(
      `✅ Connection session recorded for user ${
        user.id
      }: ${duration_seconds}s on ${platform} (event: ${
        event_type || "SESSION_START"
      })`
    );

    res.json({
      success: true,
      data: {
        session_id: session.id,
        duration_seconds: duration_seconds,
        platform: platform,
        event_type: event_type || "SESSION_START",
        user_associated: true,
      },
    } as ApiResponse);
  } catch (error) {
    console.error("Error in connection session endpoint:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    } as ApiResponse);
  }
});

// Get user's connection sessions
router.get(
  "/sessions/:identifier",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { identifier } = req.params;

      if (!identifier) {
        res.status(400).json({
          success: false,
          error: "Identifier is required",
        } as ApiResponse);
        return;
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      // Find user by email or Firebase UID
      const userModel = new User();
      let user = null;

      if (identifier.includes("@")) {
        user = await userModel.findByEmail(identifier);
      }

      if (!user) {
        user = await userModel.findByFirebaseUid(identifier);
      }

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        } as ApiResponse);
        return;
      }

      // Get connection sessions
      const sessionModel = new ConnectionSession();
      const sessions = await sessionModel.findByUserId(user.id, {
        limit,
        offset,
        orderBy: "createdAt",
        ascending: false,
      });

      res.json({
        success: true,
        data: sessions,
      } as ApiResponse);
    } catch (error) {
      console.error("Error in get sessions endpoint:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      } as ApiResponse);
    }
  }
);

// Get user's connection statistics
router.get(
  "/stats/:identifier",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { identifier } = req.params;

      if (!identifier) {
        res.status(400).json({
          success: false,
          error: "Identifier is required",
        } as ApiResponse);
        return;
      }

      // Find user by email or Firebase UID
      const userModel = new User();
      let user = null;

      if (identifier.includes("@")) {
        user = await userModel.findByEmail(identifier);
      }

      if (!user) {
        user = await userModel.findByFirebaseUid(identifier);
      }

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        } as ApiResponse);
        return;
      }

      // Get connection statistics
      const sessionModel = new ConnectionSession();
      const stats = await sessionModel.getStats(user.id);

      res.json({
        success: true,
        data: stats,
      } as ApiResponse);
    } catch (error) {
      console.error("Error in get stats endpoint:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      } as ApiResponse);
    }
  }
);

export default router;
