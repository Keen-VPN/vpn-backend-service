-- CreateTable
CREATE TABLE IF NOT EXISTS "apple_iap_purchases" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "transaction_id" TEXT NOT NULL,
  "original_transaction_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "environment" TEXT,
  "purchase_date" TIMESTAMP(3) NOT NULL,
  "expires_date" TIMESTAMP(3),
  "receipt_data" TEXT,
  "linked_user_id" UUID,
  "linked_email" TEXT,
  "linked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "apple_iap_purchases_transaction_id_key"
  ON "apple_iap_purchases" ("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "apple_iap_purchases_original_transaction_id_key"
  ON "apple_iap_purchases" ("original_transaction_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "apple_iap_purchases_linked_user_id_idx"
  ON "apple_iap_purchases" ("linked_user_id");


