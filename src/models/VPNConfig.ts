import { Prisma, VpnConfig as PrismaVpnConfig } from "@prisma/client";
import prisma from "../config/prisma.js";
import type {
  RemoteVPNConfig,
  VPNConfigRecord,
} from "../types/index.js";

function mapPrismaConfig(record: PrismaVpnConfig): VPNConfigRecord {
  return {
    id: record.id,
    version: record.version,
    payload: record.payload as unknown as RemoteVPNConfig,
    etag: record.etag,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export interface SaveVPNConfigOptions {
  version: string;
  payload: RemoteVPNConfig;
  etag: string;
  activate?: boolean;
}

export interface UpdateVPNConfigOptions {
  version?: string;
  payload?: RemoteVPNConfig;
  etag?: string;
  activate?: boolean;
}

class VPNConfig {
  async findActive(): Promise<VPNConfigRecord | null> {
    const record = await prisma.vpnConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return null;
    }

    return mapPrismaConfig(record);
  }

  async findLatest(): Promise<VPNConfigRecord | null> {
    const record = await prisma.vpnConfig.findFirst({
      orderBy: { createdAt: "desc" },
    });

    return record ? mapPrismaConfig(record) : null;
  }

  async findById(id: string): Promise<VPNConfigRecord | null> {
    const record = await prisma.vpnConfig.findUnique({
      where: { id },
    });

    return record ? mapPrismaConfig(record) : null;
  }

  async save(options: SaveVPNConfigOptions): Promise<VPNConfigRecord> {
    const { version, payload, etag, activate = false } = options;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.vpnConfig.findUnique({
        where: { version },
      });

      if (activate) {
        await tx.vpnConfig.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });
      }

      if (existing) {
        const updated = await tx.vpnConfig.update({
          where: { id: existing.id },
          data: {
            payload: payload as unknown as Prisma.InputJsonValue,
            etag,
            isActive: activate ? true : existing.isActive,
          },
        });

        return updated;
      }

      const created = await tx.vpnConfig.create({
        data: {
          version,
          payload: payload as unknown as Prisma.InputJsonValue,
          etag,
          isActive: activate,
        },
      });

      return created;
    });

    return mapPrismaConfig(result);
  }

  async update(
    id: string,
    options: UpdateVPNConfigOptions
  ): Promise<VPNConfigRecord> {
    const { version, payload, etag, activate } = options;

    if (
      typeof version === "undefined" &&
      typeof payload === "undefined" &&
      typeof etag === "undefined" &&
      typeof activate === "undefined"
    ) {
      throw new Error("NO_FIELDS_PROVIDED");
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.vpnConfig.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      if (activate === true) {
        await tx.vpnConfig.updateMany({
          where: {
            isActive: true,
            NOT: { id },
          },
          data: { isActive: false },
        });
      }

      const data: Prisma.VpnConfigUpdateInput = {};

      if (typeof version === "string" && version.length > 0) {
        data.version = version;
      }

      if (payload) {
        data.payload = payload as unknown as Prisma.InputJsonValue;
      }

      if (typeof etag === "string" && etag.length > 0) {
        data.etag = etag;
      }

      if (typeof activate === "boolean") {
        data.isActive = activate;
      }

      const updated = await tx.vpnConfig.update({
        where: { id },
        data,
      });

      return updated;
    });

    return mapPrismaConfig(result);
  }

  async delete(id: string): Promise<VPNConfigRecord> {
    try {
      const deleted = await prisma.vpnConfig.delete({
        where: { id },
      });

      return mapPrismaConfig(deleted);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new Error("NOT_FOUND");
      }

      throw error;
    }
  }
}

export default VPNConfig;

