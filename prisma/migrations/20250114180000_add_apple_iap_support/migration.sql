-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "subscription_type" TEXT NOT NULL DEFAULT 'stripe',
ADD COLUMN     "apple_transaction_id" TEXT,
ADD COLUMN     "apple_original_transaction_id" TEXT,
ADD COLUMN     "apple_product_id" TEXT,
ADD COLUMN     "apple_environment" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_apple_transaction_id_key" ON "subscriptions"("apple_transaction_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_subscription_type_idx" ON "subscriptions"("subscription_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_apple_transaction_id_idx" ON "subscriptions"("apple_transaction_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_apple_original_transaction_id_idx" ON "subscriptions"("apple_original_transaction_id");
