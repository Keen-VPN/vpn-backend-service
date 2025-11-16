import express, { Request, Response, Router } from "express";
import User from "../models/User.js";
import ConnectionSession from "../models/ConnectionSession.js";
import type {
  ApiResponse,
  TerminationReason,
  EventType,
} from "../types/index.js";
import { requirePaidOrTrial } from "../middleware/requirePaidOrTrial.js";

const router: Router = express.Router();

// Record a connection session
router.post(
  "/session",
  requirePaidOrTrial,
  async (req: Request, res: Response): Promise<void> => {
  try {
    const {
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
    const trialStatus =
      (req as any).trialStatus as
        | {
            trialActive?: boolean;
            daysRemaining?: number;
          }
        | undefined;

    // Validate required fields (duration_seconds can be 0 for SESSION_START)
    if (
      !session_start ||
      duration_seconds === undefined ||
      duration_seconds === null ||
      !platform
    ) {
      console.error("❌ Invalid payload - Missing required fields:", {
        session_start: !!session_start,
        duration_seconds:
          duration_seconds !== undefined && duration_seconds !== null,
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
    const authUserId = (req as any).authUserId as string | undefined;
    const userModel = new User();
    const user = authUserId ? await userModel.findById(authUserId) : null;

    if (!user) {
      console.error("❌ Authenticated user not found", { authUserId });
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
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
      subscriptionTier: trialStatus?.trialActive
        ? "trial"
        : subscription_tier || "free",
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
    console.error("❌ Error in connection session endpoint:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
      });
    }
    res.status(500).json({
      success: false,
      error: "Internal server error",
    } as ApiResponse);
  }
});

// Get user's connection sessions
router.get(
  "/sessions/:identifier",
  requirePaidOrTrial,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { identifier } = req.params;

      const authUserId = (req as any).authUserId as string | undefined;
      if (!authUserId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        } as ApiResponse);
        return;
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      // Find user by email, Firebase UID, or user ID
      const userModel = new User();
      let user = null;

      if (identifier && identifier.includes("@")) {
        user = await userModel.findByEmail(identifier);
      }

      if (!user && identifier) {
        // Try Firebase UID
        user = await userModel.findByFirebaseUid(identifier);
      }

      if (!user && identifier) {
        // Try user ID (UUID)
        user = await userModel.findById(identifier);
      }

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        } as ApiResponse);
        return;
      }

      const identifierMatches =
        !identifier ||
        identifier === user.id ||
        identifier === user.email ||
        identifier === user.firebaseUid;

      if (!identifierMatches) {
        res.status(403).json({
          success: false,
          error: "Forbidden",
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

      // Convert BigInt to string for JSON serialization
      const serializedSessions = sessions.map((session) => ({
        ...session,
        bytesTransferred: session.bytesTransferred?.toString(),
      }));

      res.json({
        success: true,
        data: serializedSessions,
      } as ApiResponse);
    } catch (error) {
      console.error("Error in get sessions endpoint:", error);
      console.error(
        "Error details:",
        error instanceof Error ? error.stack : error
      );
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
  requirePaidOrTrial,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { identifier } = req.params;

      const authUserId = (req as any).authUserId as string | undefined;
      if (!authUserId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        } as ApiResponse);
        return;
      }

      // Find user by email, Firebase UID, or user ID
      const userModel = new User();
      let user = null;

      if (identifier && identifier.includes("@")) {
        user = await userModel.findByEmail(identifier);
      }

      if (!user && identifier) {
        // Try Firebase UID
        user = await userModel.findByFirebaseUid(identifier);
      }

      if (!user && identifier) {
        // Try user ID (UUID)
        user = await userModel.findById(identifier as string);
      }

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        } as ApiResponse);
        return;
      }

      const identifierMatches =
        !identifier ||
        identifier === user.id ||
        identifier === user.email ||
        identifier === user.firebaseUid;

      if (!identifierMatches) {
        res.status(403).json({
          success: false,
          error: "Forbidden",
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
