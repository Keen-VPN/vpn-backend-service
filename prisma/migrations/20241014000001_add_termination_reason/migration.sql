-- CreateEnum
CREATE TYPE "termination_reason" AS ENUM ('user_termination', 'connection_lost');

-- AlterTable
ALTER TABLE "connection_sessions" ADD COLUMN "termination_reason" "termination_reason" NOT NULL DEFAULT 'user_termination';

-- CreateIndex
CREATE INDEX "connection_sessions_termination_reason_idx" ON "connection_sessions"("termination_reason");
