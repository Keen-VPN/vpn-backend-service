-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firebase_uid" TEXT,
    "apple_user_id" TEXT,
    "google_user_id" TEXT,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "stripe_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "plan_id" TEXT,
    "plan_name" TEXT,
    "price_amount" DECIMAL(10,2),
    "price_currency" TEXT DEFAULT 'USD',
    "billing_period" TEXT,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_start" TIMESTAMP(3) NOT NULL,
    "session_end" TIMESTAMP(3),
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "server_location" TEXT,
    "server_address" TEXT,
    "platform" TEXT NOT NULL,
    "app_version" TEXT,
    "bytes_transferred" BIGINT NOT NULL DEFAULT 0,
    "subscription_tier" TEXT,
    "is_anonymized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connection_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_aggregates" (
    "id" TEXT NOT NULL,
    "aggregation_date" TIMESTAMP(3) NOT NULL,
    "platform" TEXT NOT NULL,
    "server_location" TEXT NOT NULL,
    "subscription_tier" TEXT,
    "total_sessions" INTEGER NOT NULL,
    "total_duration" INTEGER NOT NULL,
    "total_bytes" BIGINT NOT NULL,
    "avg_duration" INTEGER NOT NULL,
    "avg_bytes" BIGINT NOT NULL,
    "unique_users" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_apple_user_id_key" ON "users"("apple_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_user_id_key" ON "users"("google_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions"("current_period_end");

-- CreateIndex
CREATE INDEX "connection_sessions_user_id_idx" ON "connection_sessions"("user_id");

-- CreateIndex
CREATE INDEX "connection_sessions_session_start_idx" ON "connection_sessions"("session_start");

-- CreateIndex
CREATE INDEX "connection_sessions_session_end_idx" ON "connection_sessions"("session_end");

-- CreateIndex
CREATE INDEX "connection_sessions_duration_seconds_idx" ON "connection_sessions"("duration_seconds");

-- CreateIndex
CREATE INDEX "connection_sessions_platform_idx" ON "connection_sessions"("platform");

-- CreateIndex
CREATE INDEX "connection_sessions_server_location_idx" ON "connection_sessions"("server_location");

-- CreateIndex
CREATE INDEX "connection_sessions_created_at_idx" ON "connection_sessions"("created_at");

-- CreateIndex
CREATE INDEX "connection_sessions_is_anonymized_idx" ON "connection_sessions"("is_anonymized");

-- CreateIndex
CREATE INDEX "connection_sessions_subscription_tier_idx" ON "connection_sessions"("subscription_tier");

-- CreateIndex
CREATE INDEX "session_aggregates_aggregation_date_idx" ON "session_aggregates"("aggregation_date");

-- CreateIndex
CREATE INDEX "session_aggregates_platform_idx" ON "session_aggregates"("platform");

-- CreateIndex
CREATE INDEX "session_aggregates_server_location_idx" ON "session_aggregates"("server_location");

-- CreateIndex
CREATE INDEX "session_aggregates_subscription_tier_idx" ON "session_aggregates"("subscription_tier");

-- CreateIndex
CREATE UNIQUE INDEX "session_aggregates_aggregation_date_platform_server_locatio_key" ON "session_aggregates"("aggregation_date", "platform", "server_location", "subscription_tier");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_sessions" ADD CONSTRAINT "connection_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

