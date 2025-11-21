-- Remove IP address tracking from sales contacts for privacy protection

-- Drop the index on ip_address column if it exists
DROP INDEX IF EXISTS "sales_contacts_ip_address_idx";

-- Remove ip_address column from sales_contacts table
ALTER TABLE "sales_contacts" DROP COLUMN IF EXISTS "ip_address";
