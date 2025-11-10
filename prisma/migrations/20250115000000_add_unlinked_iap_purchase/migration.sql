-- CreateTable
CREATE TABLE "unlinked_iap_purchases" (
    "id" TEXT NOT NULL,
    "apple_transaction_id" TEXT NOT NULL,
    "apple_original_transaction_id" TEXT NOT NULL,
    "apple_product_id" TEXT NOT NULL,
    "apple_environment" TEXT NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "expires_date" TIMESTAMP(3),
    "is_linked" BOOLEAN NOT NULL DEFAULT false,
    "linked_at" TIMESTAMP(3),
    "linked_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unlinked_iap_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unlinked_iap_purchases_apple_transaction_id_key" ON "unlinked_iap_purchases"("apple_transaction_id");

-- CreateIndex
CREATE INDEX "unlinked_iap_purchases_apple_transaction_id_idx" ON "unlinked_iap_purchases"("apple_transaction_id");

-- CreateIndex
CREATE INDEX "unlinked_iap_purchases_apple_original_transaction_id_idx" ON "unlinked_iap_purchases"("apple_original_transaction_id");

-- CreateIndex
CREATE INDEX "unlinked_iap_purchases_is_linked_idx" ON "unlinked_iap_purchases"("is_linked");

-- CreateIndex
CREATE INDEX "unlinked_iap_purchases_linked_user_id_idx" ON "unlinked_iap_purchases"("linked_user_id");





