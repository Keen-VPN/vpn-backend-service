-- CreateTable
CREATE TABLE "processed_sessions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "data_consumed" DECIMAL(15,2) NOT NULL,
    "average_session_bandwidth" DECIMAL(15,2) NOT NULL,
    "session_duration" DECIMAL(10,2) NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ NOT NULL,
    "termination_reason" TEXT NOT NULL,
    "server_location" TEXT,
    "processed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_sessions_session_id_key" ON "processed_sessions"("session_id");

-- CreateIndex
CREATE INDEX "processed_sessions_user_id_idx" ON "processed_sessions"("user_id");

-- CreateIndex
CREATE INDEX "processed_sessions_started_at_idx" ON "processed_sessions"("started_at");

-- CreateIndex
CREATE INDEX "processed_sessions_ended_at_idx" ON "processed_sessions"("ended_at");

-- CreateIndex
CREATE INDEX "processed_sessions_server_location_idx" ON "processed_sessions"("server_location");

-- CreateIndex
CREATE INDEX "processed_sessions_termination_reason_idx" ON "processed_sessions"("termination_reason");

-- CreateIndex
CREATE INDEX "processed_sessions_processed_at_idx" ON "processed_sessions"("processed_at");

