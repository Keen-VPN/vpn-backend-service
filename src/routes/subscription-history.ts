import express, { Request, Response, Router } from "express";
import { verifyPermanentSessionToken } from "../utils/auth.js";
import { generateWeakEtag } from "../utils/etag.js";
import SubscriptionHistoryService from "../services/SubscriptionHistoryService.js";
import User from "../models/User.js";
import type {
  ApiResponse,
  HistoryOptions,
  HistoryResponse,
  EventDetails,
} from "../types/index.js";

// Configuration constants
const DEFAULT_PAGE_SIZE = parseInt(
  process.env.HISTORY_DEFAULT_PAGE_SIZE || "25",
  10
);
const MAX_PAGE_SIZE = parseInt(process.env.HISTORY_MAX_PAGE_SIZE || "100", 10);
const CACHE_TTL_SECONDS = parseInt(process.env.HISTORY_CACHE_TTL || "300", 10); // 5 minutes default

// Simple in-memory cache for subscription history
interface CacheEntry {
  data: HistoryResponse;
  timestamp: number;
  etag: string;
}

const historyCache = new Map<string, CacheEntry>();

// Cache cleanup interval (10 minutes)
setInterval(() => {
  const now = Date.now();
  const maxAge = CACHE_TTL_SECONDS * 1000;

  for (const [key, entry] of historyCache.entries()) {
    if (now - entry.timestamp > maxAge) {
      historyCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Clear cache for a specific user
 */
function clearUserCache(userId: string): void {
  for (const key of historyCache.keys()) {
    if (key.startsWith(`history:${userId}:`)) {
      historyCache.delete(key);
    }
  }
  console.log("🧹 Cleared subscription history cache for user:", userId);
}

// Export for use in webhook handlers
export { clearUserCache };

const router: Router = express.Router();
const historyService = new SubscriptionHistoryService();
const userModel = new User();

/**
 * Performance monitoring wrapper
 */
function withPerformanceMonitoring<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  operationName: string
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;

      if (duration > 1000) {
        console.warn(`⚠️ Slow ${operationName}: ${duration}ms`);
      } else {
        console.log(`⚡ ${operationName}: ${duration}ms`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Failed ${operationName} after ${duration}ms:`, error);
      throw error;
    }
  }) as T;
}

// Wrap the service methods with monitoring
const monitoredHistoryService = {
  getUnifiedHistory: withPerformanceMonitoring(
    historyService.getUnifiedHistory.bind(historyService),
    "subscription history fetch"
  ),
  getEventDetails: withPerformanceMonitoring(
    historyService.getEventDetails.bind(historyService),
    "event details fetch"
  ),
};

/**
 * GET /subscription/history
 * Get unified subscription history timeline for authenticated user
 */
router.get("/history", async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: "Authorization header required",
      } as ApiResponse);
      return;
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.replace("Bearer ", "");
    const userInfo = verifyPermanentSessionToken(token);

    if (!userInfo) {
      res.status(401).json({
        success: false,
        error: "Invalid or expired session token",
      } as ApiResponse);
      return;
    }

    console.log("🔍 Getting subscription history for user:", userInfo.userId);

    // Verify user exists
    const user = await userModel.findById(userInfo.userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      } as ApiResponse);
      return;
    }

    // Parse query parameters
    const {
      page = "1",
      limit = DEFAULT_PAGE_SIZE.toString(),
      provider,
      dateFrom,
      dateTo,
    } = req.query;

    // Validate pagination parameters
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      res.status(400).json({
        success: false,
        error: "Invalid page number",
      } as ApiResponse);
      return;
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > MAX_PAGE_SIZE) {
      res.status(400).json({
        success: false,
        error: `Limit must be between 1 and ${MAX_PAGE_SIZE}`,
      } as ApiResponse);
      return;
    }

    // Validate provider filter
    if (provider && provider !== "stripe" && provider !== "apple_iap") {
      res.status(400).json({
        success: false,
        error: "Provider must be 'stripe' or 'apple_iap'",
      } as ApiResponse);
      return;
    }

    // Validate date filters
    let dateFromValid: string | undefined;
    let dateToValid: string | undefined;

    if (dateFrom) {
      const dateFromObj = new Date(dateFrom as string);
      if (isNaN(dateFromObj.getTime())) {
        res.status(400).json({
          success: false,
          error: "Invalid dateFrom format. Use ISO string.",
        } as ApiResponse);
        return;
      }
      dateFromValid = dateFromObj.toISOString();
    }

    if (dateTo) {
      const dateToObj = new Date(dateTo as string);
      if (isNaN(dateToObj.getTime())) {
        res.status(400).json({
          success: false,
          error: "Invalid dateTo format. Use ISO string.",
        } as ApiResponse);
        return;
      }
      dateToValid = dateToObj.toISOString();
    }

    const options: HistoryOptions = {
      page: pageNum,
      limit: limitNum,
      provider: provider as "stripe" | "apple_iap" | undefined,
      dateFrom: dateFromValid,
      dateTo: dateToValid,
    };

    // Generate cache key
    const cacheKey = `history:${userInfo.userId}:${JSON.stringify(options)}`;
    const now = Date.now();

    // Check cache first
    const cached = historyCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_SECONDS * 1000) {
      console.log("✅ Serving subscription history from cache");

      // Check if client has up-to-date version using ETag
      const clientETag = req.headers["if-none-match"];
      if (clientETag === cached.etag) {
        res.status(304).end();
        return;
      }

      res.set({
        "Cache-Control": `private, max-age=${CACHE_TTL_SECONDS}`,
        ETag: cached.etag,
      });

      res.json({
        success: true,
        data: cached.data,
      } as ApiResponse<HistoryResponse>);
      return;
    }

    // Fetch fresh data
    const history = await monitoredHistoryService.getUnifiedHistory(
      userInfo.userId,
      options
    );

    // Generate ETag based on data content
    const etag = generateWeakEtag(history);

    // Cache the result
    historyCache.set(cacheKey, {
      data: history,
      timestamp: now,
      etag,
    });

    // Set cache headers
    res.set({
      "Cache-Control": `private, max-age=${CACHE_TTL_SECONDS}`,
      ETag: etag,
    });

    res.json({
      success: true,
      data: history,
    } as ApiResponse<HistoryResponse>);
  } catch (error) {
    console.error("❌ Error getting subscription history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get subscription history",
    } as ApiResponse);
  }
});

/**
 * GET /subscription/history/:eventId/details
 * Get detailed information for a specific history event
 */
router.get(
  "/history/:eventId/details",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        res.status(401).json({
          success: false,
          error: "Authorization header required",
        } as ApiResponse);
        return;
      }

      const token = authHeader.replace("Bearer ", "");
      const userInfo = verifyPermanentSessionToken(token);

      if (!userInfo) {
        res.status(401).json({
          success: false,
          error: "Invalid or expired session token",
        } as ApiResponse);
        return;
      }

      const { eventId } = req.params;

      if (!eventId) {
        res.status(400).json({
          success: false,
          error: "Event ID is required",
        } as ApiResponse);
        return;
      }

      console.log("🔍 Getting event details for:", eventId);

      // Verify user exists
      const user = await userModel.findById(userInfo.userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        } as ApiResponse);
        return;
      }

      const eventDetails = await monitoredHistoryService.getEventDetails(
        userInfo.userId,
        eventId
      );

      res.json({
        success: true,
        data: eventDetails,
      } as ApiResponse<EventDetails>);
    } catch (error) {
      console.error("❌ Error getting event details:", error);

      // Handle specific error types
      if (error instanceof Error) {
        if (
          error.message.includes("not found") ||
          error.message.includes("access denied")
        ) {
          res.status(404).json({
            success: false,
            error: "Event not found",
          } as ApiResponse);
          return;
        }

        if (error.message.includes("Invalid event ID")) {
          res.status(400).json({
            success: false,
            error: "Invalid event ID format",
          } as ApiResponse);
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: "Failed to get event details",
      } as ApiResponse);
    }
  }
);

/**
 * POST /subscription/history
 * Alternative endpoint that accepts session token in body (for compatibility)
 */
router.post("/history", async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken, ...queryParams } = req.body;

    if (!sessionToken) {
      res.status(400).json({
        success: false,
        error: "Session token is required in body",
      } as ApiResponse);
      return;
    }

    const userInfo = verifyPermanentSessionToken(sessionToken);

    if (!userInfo) {
      res.status(401).json({
        success: false,
        error: "Invalid or expired session token",
      } as ApiResponse);
      return;
    }

    console.log(
      "🔍 Getting subscription history for user (POST):",
      userInfo.userId
    );

    // Verify user exists
    const user = await userModel.findById(userInfo.userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      } as ApiResponse);
      return;
    }

    // Parse body parameters (same validation as GET endpoint)
    const { page = 1, limit = 25, provider, dateFrom, dateTo } = queryParams;

    // Validate parameters
    if (page < 1 || limit < 1 || limit > 100) {
      res.status(400).json({
        success: false,
        error: "Invalid pagination parameters",
      } as ApiResponse);
      return;
    }

    if (provider && provider !== "stripe" && provider !== "apple_iap") {
      res.status(400).json({
        success: false,
        error: "Provider must be 'stripe' or 'apple_iap'",
      } as ApiResponse);
      return;
    }

    const options: HistoryOptions = {
      page,
      limit,
      provider,
      dateFrom,
      dateTo,
    };

    const history = await monitoredHistoryService.getUnifiedHistory(
      userInfo.userId,
      options
    );

    res.json({
      success: true,
      data: history,
    } as ApiResponse<HistoryResponse>);
  } catch (error) {
    console.error("❌ Error getting subscription history (POST):", error);
    res.status(500).json({
      success: false,
      error: "Failed to get subscription history",
    } as ApiResponse);
  }
});

export default router;
