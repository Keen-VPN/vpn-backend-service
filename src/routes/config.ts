import express, { Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import VPNConfigModel from "../models/VPNConfig.js";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { generateWeakEtag } from "../utils/etag.js";
import type {
  RemoteVPNConfig,
  SaveVPNConfigRequest,
  UpdateVPNConfigRequest,
  VPNConfigResponseBody,
} from "../types/index.js";

const router: Router = express.Router();
const vpnConfigModel = new VPNConfigModel();

// Hardcoded fallback config (used when file is not available, e.g., in Netlify Functions)
const hardcodedFallbackConfig: RemoteVPNConfig = {
  version: "fallback-1.0.0",
  updatedAt: null,
  servers: [
    {
      id: "us-east",
      name: "United States",
      country: "United States",
      city: "Virginia",
      serverAddress: "3.225.112.116",
      remoteIdentifier: null,
      credentialId: "client",
      assetKey: "us",
      flagUrl: "https://flagcdn.com/w40/us.png",
      coordinates: {
        lat: 37.5407,
        lng: -77.436,
      },
      isDefault: true,
      sortOrder: 10,
      metadata: null,
    },
    {
      id: "ng-lagos",
      name: "Nigeria",
      country: "Nigeria",
      city: "Lagos",
      serverAddress: "169.255.57.34",
      remoteIdentifier: null,
      credentialId: "client",
      assetKey: "ng",
      flagUrl: "https://flagcdn.com/w40/ng.png",
      coordinates: {
        lat: 7.5000,
        lng: 3.3500,
      },
      isDefault: false,
      sortOrder: 20,
      metadata: null,
    },
  ],
  credentials: [
    {
      id: "client",
      username: "client",
      password: "KeenVPNClient2024Secure",
      sharedSecret: null,
      certificate: null,
      certificatePassword: null,
      metadata: null,
    },
  ],
  featureFlags: null,
  rollout: null,
  metadata: null,
};

// Lazy load default config with fallback
function getDefaultConfig(): RemoteVPNConfig {
  try {
    // Try multiple possible paths for the config file
    const possiblePaths = [
      path.resolve(process.cwd(), "src/config/default-vpn-config.json"),
      path.resolve(process.cwd(), "dist/config/default-vpn-config.json"),
    ];

    for (const configPath of possiblePaths) {
      if (existsSync(configPath)) {
        const fileContent = readFileSync(configPath, "utf-8");
        return JSON.parse(fileContent) as RemoteVPNConfig;
      }
    }

    // If file not found, use hardcoded fallback
    console.warn("⚠️ default-vpn-config.json not found, using hardcoded fallback");
    return hardcodedFallbackConfig;
  } catch (error) {
    console.error("❌ Failed to load default VPN config, using hardcoded fallback:", error);
    return hardcodedFallbackConfig;
  }
}

const fallbackConfig = getDefaultConfig();
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

function normalizeConfigDates(config: RemoteVPNConfig): RemoteVPNConfig {
  if (!config) {
    return config;
  }

  let updatedAt = config.updatedAt;
  if (updatedAt) {
    const toIsoString = (value: string): string | undefined => {
      if (!value) {
        return undefined;
      }

      const attempt = (input: string): string | undefined => {
        const parsed = new Date(input);
        return Number.isNaN(parsed.getTime())
          ? undefined
          : parsed.toISOString();
      };

      // First try the raw value.
      let iso = attempt(value);
      if (iso) {
        return iso;
      }

      // Some legacy configs replace ":" with "-" in the time component.
      const legacyMatch = value.match(
        /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?Z$/
      );
      if (legacyMatch) {
        const [_, date, hh, mm, ss, ms] = legacyMatch;
        const fixed = `${date}T${hh}:${mm}:${ss}${ms ? `.${ms}` : ""}Z`;
        iso = attempt(fixed);
        if (iso) {
          return iso;
        }
      }

      console.warn(
        `⚠️ normalizeConfigDates: unable to parse updatedAt "${value}", dropping field`
      );
      return undefined;
    };

    updatedAt =
      typeof updatedAt === "string"
        ? toIsoString(updatedAt)
        : toIsoString(String(updatedAt));
  }

  return {
    ...config,
    updatedAt,
  };
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
    const normalizedConfig = normalizeConfigDates(payload);
    const etag = record?.etag ?? fallbackEtag;

    if (req.headers["if-none-match"] === etag) {
      res.status(304).set("ETag", etag).end();
      return;
    }

    const response: VPNConfigResponseBody = {
      config: normalizedConfig,
      version: normalizedConfig.version,
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
      if (
        activate &&
        expectedClientToken &&
        expectedClientToken.trim().length > 0
      ) {
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
        payload: normalizeConfigDates(payload),
        etag: computedEtag,
        activate,
      });

      const response: VPNConfigResponseBody = {
        config: normalizeConfigDates(record.payload),
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

router.put(
  "/vpn/:id",
  async (
    req: Request<{ id: string }, unknown, UpdateVPNConfigRequest>,
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

      const { config, activate, etag } = req.body;
      const hasConfig = typeof config === "object" && config !== null;
      const hasActivate = typeof activate === "boolean";
      const hasEtag = typeof etag === "string" && etag.trim().length > 0;

      if (!hasConfig && !hasActivate && !hasEtag) {
        res.status(400).json({
          success: false,
          error:
            "Invalid request: provide at least one of config, activate, or etag",
        });
        return;
      }

      if (activate === true) {
        const expectedClientToken = process.env.CONFIG_CLIENT_TOKEN;
        if (
          expectedClientToken &&
          expectedClientToken.trim().length > 0 &&
          getClientTokenFromRequest(req) !== expectedClientToken
        ) {
          res.status(401).json({
            success: false,
            error: "Unauthorized: invalid client token",
          });
          return;
        }
      }

      let payload: RemoteVPNConfig | undefined;
      let nextEtag = etag;
      let nextVersion: string | undefined;

      if (hasConfig) {
        const configPayload = config as RemoteVPNConfig;
        const errors = validateConfigPayload(configPayload);
        if (errors.length > 0) {
          res.status(400).json({
            success: false,
            error: `Invalid configuration: ${errors.join(", ")}`,
          });
          return;
        }

        payload = configPayload;
        nextVersion = configPayload.version;
        if (!nextEtag || nextEtag.trim().length === 0) {
          nextEtag = generateWeakEtag(configPayload);
        }
      }

      const record = await vpnConfigModel.update(req.params.id, {
        payload: payload ? normalizeConfigDates(payload) : undefined,
        version: nextVersion,
        etag: nextEtag,
        activate,
      });

      const response: VPNConfigResponseBody = {
        config: normalizeConfigDates(record.payload),
        version: record.version,
        etag: record.etag,
        source: "database",
        updatedAt: record.updatedAt.toISOString(),
      };

      res.status(200).json({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error("❌ Failed to update VPN config:", error);

      if (error instanceof Error) {
        if (error.message === "NOT_FOUND") {
          res.status(404).json({
            success: false,
            error: "Configuration not found",
          });
          return;
        }

        if (error.message === "NO_FIELDS_PROVIDED") {
          res.status(400).json({
            success: false,
            error: "No update fields provided",
          });
          return;
        }
      }

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
        error: "Failed to update VPN configuration",
      });
    }
  }
);

router.delete(
  "/vpn/:id",
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
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

      const record = await vpnConfigModel.delete(req.params.id);

      res.status(200).json({
        success: true,
        data: {
          id: record.id,
          version: record.version,
          deleted: true,
        },
      });
    } catch (error) {
      console.error("❌ Failed to delete VPN config:", error);

      if (error instanceof Error && error.message === "NOT_FOUND") {
        res.status(404).json({
          success: false,
          error: "Configuration not found",
        });
        return;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        res.status(404).json({
          success: false,
          error: "Configuration not found",
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to delete VPN configuration",
      });
    }
  }
);

export default router;
