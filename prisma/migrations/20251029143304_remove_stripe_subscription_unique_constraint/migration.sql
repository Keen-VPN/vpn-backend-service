-- Drop the unique constraint on stripe_subscription_id
-- This allows multiple subscription records with the same Stripe subscription ID
-- for different billing periods (to track subscription history)
DROP INDEX IF EXISTS "subscriptions_stripe_subscription_id_key";

-- Create a composite unique constraint on (stripe_subscription_id, current_period_start)
-- This prevents duplicate records for the same billing period while allowing
-- multiple records for the same Stripe subscription ID across different periods
-- Note: PostgreSQL allows multiple NULLs in unique indexes, so this works with nullable fields
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_period_unique" 
ON "subscriptions"("stripe_subscription_id", "current_period_start");

