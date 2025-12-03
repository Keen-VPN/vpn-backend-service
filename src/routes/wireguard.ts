import express, { Request, Response, Router } from "express";
import { requirePaidOrTrial } from "../middleware/requirePaidOrTrial.js";
import { verifyPermanentSessionToken } from "../utils/auth.js";
import WireGuardService from "../services/WireGuardService.js";

const router: Router = express.Router();
const wireGuardService = new WireGuardService();

/**
 * Register WireGuard peer (client public key) with server
 * POST /api/wireguard/register-peer
 * 
 * Body: {
 *   serverId: string (e.g., "us-east", "ng-lagos")
 *   publicKey: string (client's WireGuard public key)
 *   sessionToken?: string (optional, can be in Authorization header)
 * }
 */
router.post(
  "/register-peer",
  requirePaidOrTrial,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { serverId, publicKey } = req.body;
      const userId = (req as any).authUserId;

      if (!serverId || !publicKey) {
        res.status(400).json({
          success: false,
          error: "Missing required fields: serverId and publicKey",
        });
        return;
      }

      // Validate public key format (base64, ~44 characters)
      if (typeof publicKey !== "string" || publicKey.length < 40 || publicKey.length > 50) {
        res.status(400).json({
          success: false,
          error: "Invalid public key format",
        });
        return;
      }

      // Check if peer already exists
      const exists = await wireGuardService.peerExists(serverId, publicKey);
      if (exists) {
        // Get existing peer info
        const peerInfo = await wireGuardService.getPeerInfo(serverId, publicKey);
        const clientIP = peerInfo?.allowedIPs?.split("/")[0];

        res.json({
          success: true,
          message: "Peer already registered",
          clientIP,
          peerInfo,
        });
        return;
      }

      // Add peer to server
      const result = await wireGuardService.addPeer(serverId, {
        publicKey,
        allowedIPs: "0.0.0.0/0", // Will be overridden by server's IP allocation
        persistentKeepalive: 25,
      });

      if (result.success) {
        console.log(`✅ Registered WireGuard peer for user ${userId} on server ${serverId}`);
        res.json({
          success: true,
          message: "Peer registered successfully",
          clientIP: result.clientIP,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || "Failed to register peer",
        });
      }
    } catch (error: any) {
      console.error("❌ WireGuard peer registration error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);

/**
 * Remove WireGuard peer from server
 * DELETE /api/wireguard/remove-peer
 * 
 * Body: {
 *   serverId: string
 *   publicKey: string
 * }
 */
router.delete(
  "/remove-peer",
  requirePaidOrTrial,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { serverId, publicKey } = req.body;
      const userId = (req as any).authUserId;

      if (!serverId || !publicKey) {
        res.status(400).json({
          success: false,
          error: "Missing required fields: serverId and publicKey",
        });
        return;
      }

      const result = await wireGuardService.removePeer(serverId, publicKey);

      if (result.success) {
        console.log(`✅ Removed WireGuard peer for user ${userId} from server ${serverId}`);
        res.json({
          success: true,
          message: "Peer removed successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || "Failed to remove peer",
        });
      }
    } catch (error: any) {
      console.error("❌ WireGuard peer removal error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);

/**
 * Get peer information
 * GET /api/wireguard/peer-info?serverId=xxx&publicKey=xxx
 */
router.get(
  "/peer-info",
  requirePaidOrTrial,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { serverId, publicKey } = req.query;

      if (!serverId || !publicKey || typeof serverId !== "string" || typeof publicKey !== "string") {
        res.status(400).json({
          success: false,
          error: "Missing required query parameters: serverId and publicKey",
        });
        return;
      }

      const peerInfo = await wireGuardService.getPeerInfo(serverId, publicKey);

      if (peerInfo) {
        res.json({
          success: true,
          peerInfo,
        });
      } else {
        res.status(404).json({
          success: false,
          error: "Peer not found",
        });
      }
    } catch (error: any) {
      console.error("❌ WireGuard peer info error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);

export default router;


