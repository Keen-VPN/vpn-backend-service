-- Add trial flags on users
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "trial_active" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "trial_starts_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "trial_tier" TEXT;

-- Trial grant audit table
CREATE TABLE IF NOT EXISTS "trial_grants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_hash" TEXT NOT NULL,
  "granted_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "expires_at" TIMESTAMP NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'auto',
  "metadata" JSONB,
  CONSTRAINT "trial_grants_user_unique" UNIQUE ("user_id"),
  CONSTRAINT "trial_grants_device_hash_chk" CHECK ("device_hash" <> '')
);

CREATE INDEX IF NOT EXISTS "trial_grants_device_hash" ON "trial_grants" ("device_hash");

-- Trial device fingerprint table
CREATE TABLE IF NOT EXISTS "trial_device_fingerprints" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "hash" TEXT NOT NULL,
  "platform" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "last_seen" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "trial_device_fingerprints_hash_unique" UNIQUE ("hash")
);

CREATE INDEX IF NOT EXISTS "trial_device_fingerprints_user_id" ON "trial_device_fingerprints" ("user_id");
