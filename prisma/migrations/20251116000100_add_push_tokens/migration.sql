-- Create push_tokens table for storing device push notification tokens
CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "device_hash" TEXT,
  "platform" TEXT,
  "environment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure token is unique per device
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_key"
  ON "push_tokens" ("token");

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS "push_tokens_user_id_idx"
  ON "push_tokens" ("user_id");

