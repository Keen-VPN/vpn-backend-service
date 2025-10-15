-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('session_start', 'heartbeat', 'session_end');

-- AlterTable
ALTER TABLE "connection_sessions" ADD COLUMN     "event_type" "event_type" NOT NULL DEFAULT 'session_start';
ALTER TABLE "connection_sessions" ADD COLUMN     "heartbeat_timestamp" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "connection_sessions_event_type_idx" ON "connection_sessions"("event_type");

-- CreateIndex
CREATE INDEX "connection_sessions_heartbeat_timestamp_idx" ON "connection_sessions"("heartbeat_timestamp");
