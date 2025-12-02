import express, { Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import UserServerPreference from "../models/UserServerPreference.js";
import { verifyPermanentSessionToken } from "../utils/auth.js";
import { isValidCountryName } from "../utils/validation.js";
import type {
  UserServerPreferenceRequest,
  UserServerPreferenceResponse,
  ApiResponse,
} from "../types/index.js";

const router: Router = express.Router();

/**
 * POST /api/v1/user/preferences/server-locations
 * Submit user preferences for VPN server locations
 */
router.post(
  "/server-locations",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { country, reason } = req.body as UserServerPreferenceRequest;
      const authHeader = req.headers.authorization;

      // Extract session token from Authorization header
      let sessionToken = authHeader?.replace("Bearer ", "");

      // Fallback: check body for sessionToken (backward compatibility)
      if (!sessionToken && (req.body as any).sessionToken) {
        sessionToken = (req.body as any).sessionToken;
      }

      // Validate authentication
      if (!sessionToken) {
        res.status(401).json({
          success: false,
          error: "Authentication required. Please provide a session token.",
        } as UserServerPreferenceResponse);
        return;
      }

      // Verify session token
      const payload = verifyPermanentSessionToken(sessionToken);
      if (!payload) {
        res.status(401).json({
          success: false,
          error: "Invalid or expired session token",
        } as UserServerPreferenceResponse);
        return;
      }

      const userId = payload.userId;

      // Validate required fields
      if (!country || !reason) {
        res.status(400).json({
          success: false,
          error:
            "Missing required fields: country and reason are both required",
        } as UserServerPreferenceResponse);
        return;
      }

      // Validate field types
      if (typeof country !== "string" || typeof reason !== "string") {
        res.status(400).json({
          success: false,
          error: "Invalid field types: country and reason must be strings",
        } as UserServerPreferenceResponse);
        return;
      }

      // Trim and validate field lengths
      const trimmedCountry = country.trim();
      const trimmedReason = reason.trim();

      if (trimmedCountry.length === 0) {
        res.status(400).json({
          success: false,
          error: "Country cannot be empty",
        } as UserServerPreferenceResponse);
        return;
      }

      if (trimmedReason.length === 0) {
        res.status(400).json({
          success: false,
          error: "Reason cannot be empty",
        } as UserServerPreferenceResponse);
        return;
      }

      if (trimmedCountry.length > 100) {
        res.status(400).json({
          success: false,
          error: "Country name is too long (maximum 100 characters)",
        } as UserServerPreferenceResponse);
        return;
      }

      if (trimmedReason.length > 500) {
        res.status(400).json({
          success: false,
          error: "Reason is too long (maximum 500 characters)",
        } as UserServerPreferenceResponse);
        return;
      }

      // Validate country name format (basic validation)
      if (!isValidCountryName(trimmedCountry)) {
        res.status(400).json({
          success: false,
          error:
            "Invalid country name format. Please provide a valid country name.",
        } as UserServerPreferenceResponse);
        return;
      }

      console.log("📊 User server preference submission:", {
        userId,
        country: trimmedCountry,
        reasonLength: trimmedReason.length,
        userAgent: req.headers["user-agent"],
      });

      const userServerPreferenceModel = new UserServerPreference();

      // Check if user already has a preference for this country
      const existingPreference =
        await userServerPreferenceModel.findByUserIdAndCountry(
          userId,
          trimmedCountry
        );

      if (existingPreference) {
        // Update existing preference with new reason
        console.log(
          "📝 Updating existing preference for country:",
          trimmedCountry
        );
        const updatedPreference = await userServerPreferenceModel.update(
          existingPreference.id,
          { reason: trimmedReason }
        );

        res.status(200).json({
          success: true,
          data: {
            id: updatedPreference.id,
            userId: updatedPreference.userId,
            country: updatedPreference.country,
            reason: updatedPreference.reason,
            createdAt: updatedPreference.createdAt.toISOString(),
            updatedAt: updatedPreference.updatedAt.toISOString(),
          },
          message: "Server location preference updated successfully",
        } as UserServerPreferenceResponse);
      } else {
        // Create new preference
        console.log("📝 Creating new preference for country:", trimmedCountry);
        const newPreference = await userServerPreferenceModel.create(userId, {
          country: trimmedCountry,
          reason: trimmedReason,
        });

        res.status(201).json({
          success: true,
          data: {
            id: newPreference.id,
            userId: newPreference.userId,
            country: newPreference.country,
            reason: newPreference.reason,
            createdAt: newPreference.createdAt.toISOString(),
            updatedAt: newPreference.updatedAt.toISOString(),
          },
          message: "Server location preference submitted successfully",
        } as UserServerPreferenceResponse);
      }

      console.log("✅ User server preference processed successfully");
    } catch (error) {
      console.error("❌ Error processing server preference:", error);

      // Handle specific Prisma errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          // Unique constraint violation (shouldn't happen due to our check above, but just in case)
          res.status(409).json({
            success: false,
            error: "You have already submitted a preference for this country",
          } as UserServerPreferenceResponse);
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: "Failed to process server location preference",
      } as UserServerPreferenceResponse);
    }
  }
);

/**
 * GET /api/v1/user/preferences/server-locations
 * Get user's submitted server location preferences
 */
router.get(
  "/server-locations",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const sessionToken = authHeader?.replace("Bearer ", "");

      // Validate authentication
      if (!sessionToken) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        } as ApiResponse);
        return;
      }

      // Verify session token
      const payload = verifyPermanentSessionToken(sessionToken);
      if (!payload) {
        res.status(401).json({
          success: false,
          error: "Invalid or expired session token",
        } as ApiResponse);
        return;
      }

      const userId = payload.userId;
      const userServerPreferenceModel = new UserServerPreference();

      // Get all preferences for this user
      const preferences = await userServerPreferenceModel.findByUserId(userId);

      console.log("🔍 Retrieved user server preferences:", {
        userId,
        count: preferences.length,
      });

      res.status(200).json({
        success: true,
        data: preferences.map((pref) => ({
          id: pref.id,
          userId: pref.userId,
          country: pref.country,
          reason: pref.reason,
          createdAt: pref.createdAt.toISOString(),
          updatedAt: pref.updatedAt.toISOString(),
        })),
      } as ApiResponse);
    } catch (error) {
      console.error("❌ Error retrieving server preferences:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve server location preferences",
      } as ApiResponse);
    }
  }
);

export default router;
