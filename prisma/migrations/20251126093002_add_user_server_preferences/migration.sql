/*
  Warnings:

  - The primary key for the `apple_iap_purchases` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `push_tokens` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `trial_device_fingerprints` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `trial_grants` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `vpn_configs` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "push_tokens" DROP CONSTRAINT "push_tokens_user_id_fkey";

-- DropForeignKey
ALTER TABLE "trial_device_fingerprints" DROP CONSTRAINT "trial_device_fingerprints_user_id_fkey";

-- DropForeignKey
ALTER TABLE "trial_grants" DROP CONSTRAINT "trial_grants_user_id_fkey";

-- DropIndex
DROP INDEX "vpn_configs_etag_key";

-- DropIndex
DROP INDEX "vpn_configs_is_active_idx";

-- AlterTable
ALTER TABLE "apple_iap_purchases" DROP CONSTRAINT "apple_iap_purchases_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "linked_user_id" SET DATA TYPE TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT,
ADD CONSTRAINT "apple_iap_purchases_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "push_tokens" DROP CONSTRAINT "push_tokens_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "sales_contacts" ALTER COLUMN "country_region" DROP NOT NULL;

-- AlterTable
ALTER TABLE "trial_device_fingerprints" DROP CONSTRAINT "trial_device_fingerprints_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_seen" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "trial_device_fingerprints_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "trial_grants" DROP CONSTRAINT "trial_grants_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "granted_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "trial_grants_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trial_starts_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "trial_ends_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vpn_configs" DROP CONSTRAINT "vpn_configs_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "etag" DROP NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT,
ADD CONSTRAINT "vpn_configs_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "user_server_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_server_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_server_preferences_user_id" ON "user_server_preferences"("user_id");

-- CreateIndex
CREATE INDEX "user_server_preferences_country" ON "user_server_preferences"("country");

-- CreateIndex
CREATE INDEX "user_server_preferences_created_at" ON "user_server_preferences"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_server_preferences_user_country_unique" ON "user_server_preferences"("user_id", "country");

-- CreateIndex
CREATE INDEX "vpn_configs_is_active_created_at_idx" ON "vpn_configs"("is_active", "created_at");

-- AddForeignKey
ALTER TABLE "apple_iap_purchases" ADD CONSTRAINT "apple_iap_purchases_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_grants" ADD CONSTRAINT "trial_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_device_fingerprints" ADD CONSTRAINT "trial_device_fingerprints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_server_preferences" ADD CONSTRAINT "user_server_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "push_tokens_user_id_idx" RENAME TO "push_tokens_user_id";

-- RenameIndex
ALTER INDEX "trial_device_fingerprints_hash_unique" RENAME TO "trial_device_fingerprints_hash_key";

-- RenameIndex
ALTER INDEX "trial_grants_user_unique" RENAME TO "trial_grants_user_id_key";
