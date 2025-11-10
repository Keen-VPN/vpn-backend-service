import express, { Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import VPNConfigModel from "../models/VPNConfig.js";
import defaultConfigJson from "../config/default-vpn-config.json" assert { type: "json" };
import { generateWeakEtag } from "../utils/etag.js";
import type {
  RemoteVPNConfig,
  SaveVPNConfigRequest,
  VPNConfigResponseBody,
} from "../types/index.js";

const router: Router = express.Router();
const vpnConfigModel = new VPNConfigModel();

const fallbackConfig = defaultConfigJson as RemoteVPNConfig;
const fallbackEtag = generateWeakEtag(fallbackConfig);

function getClientTokenFromRequest(req: Request): string | null {
  const headerToken = req.headers["x-config-client"];
  if (typeof headerToken === "string" && headerToken.trim() !== "") {
    return headerToken.trim();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "").trim();
  }

  return null;
}

function getAdminTokenFromRequest(req: Request): string | null {
  const headerToken = req.headers["x-config-token"];
  if (typeof headerToken === "string" && headerToken.trim() !== "") {
    return headerToken.trim();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "").trim();
  }

  return null;
}

function validateConfigPayload(config: RemoteVPNConfig): string[] {
  const errors: string[] = [];

  if (!config || typeof config !== "object") {
    errors.push("config must be an object");
    return errors;
  }

  if (!config.version || typeof config.version !== "string") {
    errors.push("config.version is required and must be a string");
  }

  if (!Array.isArray(config.servers) || config.servers.length === 0) {
    errors.push("config.servers must be a non-empty array");
  }

  if (!Array.isArray(config.credentials) || config.credentials.length === 0) {
    errors.push("config.credentials must be a non-empty array");
  }

  return errors;
}

router.get("/vpn", async (req: Request, res: Response): Promise<void> => {
  try {
    const expectedClientToken = process.env.CONFIG_CLIENT_TOKEN;
    if (expectedClientToken && expectedClientToken.trim().length > 0) {
      const providedClientToken = getClientTokenFromRequest(req);
      if (providedClientToken !== expectedClientToken) {
        res.status(401).json({
          success: false,
          error: "Unauthorized: invalid client token",
        });
        return;
      }
    }

    const previewRequested = req.query.preview === "true";
    let record = null;

    if (previewRequested) {
      const expectedToken = process.env.CONFIG_ADMIN_TOKEN;
      const providedToken = getAdminTokenFromRequest(req);

      if (!expectedToken || providedToken !== expectedToken) {
        res.status(401).json({
          success: false,
          error: "Unauthorized: preview requires a valid configuration token",
        });
        return;
      }

      record = await vpnConfigModel.findLatest();
    } else {
      record = await vpnConfigModel.findActive();
    }

    const payload = record?.payload ?? fallbackConfig;
    const etag = record?.etag ?? fallbackEtag;

    if (req.headers["if-none-match"] === etag) {
      res.status(304).set("ETag", etag).end();
      return;
    }

    const response: VPNConfigResponseBody = {
      config: payload,
      version: payload.version,
      etag,
      source: record ? "database" : "fallback",
      updatedAt: record?.updatedAt?.toISOString() ?? null,
    };

    res
      .status(200)
      .set({
        "Cache-Control": "public, max-age=60",
        ETag: etag,
      })
      .json(response);
  } catch (error) {
    console.error("❌ Failed to fetch VPN config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to load VPN configuration",
    });
  }
});

router.post(
  "/vpn",
  async (
    req: Request<Record<string, never>, unknown, SaveVPNConfigRequest>,
    res: Response
  ) => {
    try {
      const expectedToken = process.env.CONFIG_ADMIN_TOKEN;
      if (!expectedToken) {
        res.status(503).json({
          success: false,
          error: "CONFIG_ADMIN_TOKEN is not configured on the server",
        });
        return;
      }

      const providedToken = getAdminTokenFromRequest(req);
      if (!providedToken || providedToken !== expectedToken) {
        res.status(401).json({
          success: false,
          error: "Unauthorized: invalid configuration token",
        });
        return;
      }

      if (!req.body || typeof req.body !== "object") {
        res.status(400).json({
          success: false,
          error: "Request body is required",
        });
        return;
      }

      const { config, activate = true, etag } = req.body;

    const expectedClientToken = process.env.CONFIG_CLIENT_TOKEN;
    if (activate && expectedClientToken && expectedClientToken.trim().length > 0) {
      const providedClientToken = getClientTokenFromRequest(req);
      if (providedClientToken !== expectedClientToken) {
        res.status(401).json({
          success: false,
          error: "Unauthorized: invalid client token",
        });
        return;
      }
    }

      if (!config || typeof config !== "object") {
        res.status(400).json({
          success: false,
          error: "config object is required in request body",
        });
        return;
      }

      const errors = validateConfigPayload(config as RemoteVPNConfig);
      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          error: `Invalid configuration: ${errors.join(", ")}`,
        });
        return;
      }

      const payload = config as RemoteVPNConfig;
      const computedEtag = etag ?? generateWeakEtag(payload);

      const record = await vpnConfigModel.save({
        version: payload.version,
        payload,
        etag: computedEtag,
        activate,
      });

      const response: VPNConfigResponseBody = {
        config: record.payload,
        version: record.version,
        etag: record.etag,
        source: "database",
        updatedAt: record.updatedAt.toISOString(),
      };

      res.status(activate ? 200 : 202).json({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error("❌ Failed to save VPN config:", error);

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        res.status(409).json({
          success: false,
          error:
            "A configuration with the same version or etag already exists. Use a new version or update the existing one.",
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to save VPN configuration",
      });
    }
  }
);

export default router;

