-- Create table for storing VPN configuration payloads
CREATE TABLE "vpn_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "etag" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vpn_configs_pkey" PRIMARY KEY ("id")
);

-- Ensure version strings remain unique to make rollbacks/audits simpler
CREATE UNIQUE INDEX "vpn_configs_version_key" ON "vpn_configs"("version");

-- ETags must also be unique to keep cache validation reliable
CREATE UNIQUE INDEX "vpn_configs_etag_key" ON "vpn_configs"("etag");

-- Handy index for quickly finding the active config
CREATE INDEX "vpn_configs_is_active_idx" ON "vpn_configs"("is_active");


