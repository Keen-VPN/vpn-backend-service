-- CreateTable
CREATE TABLE "sales_contacts" (
    "id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "work_email" TEXT NOT NULL,
    "team_size" INTEGER NOT NULL,
    "country_region" TEXT NOT NULL,
    "has_consent" BOOLEAN NOT NULL,
    "phone" TEXT,
    "use_case" TEXT,
    "preferred_contact_method" TEXT,
    "preferred_contact_time" TEXT,
    "message" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sales_team_notified" BOOLEAN NOT NULL DEFAULT false,
    "customer_confirmation_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_contacts_reference_id_key" ON "sales_contacts"("reference_id");

-- CreateIndex
CREATE INDEX "sales_contacts_work_email_idx" ON "sales_contacts"("work_email");

-- CreateIndex
CREATE INDEX "sales_contacts_reference_id_idx" ON "sales_contacts"("reference_id");

-- CreateIndex
CREATE INDEX "sales_contacts_created_at_idx" ON "sales_contacts"("created_at");

-- CreateIndex
CREATE INDEX "sales_contacts_status_idx" ON "sales_contacts"("status");

-- CreateIndex
CREATE INDEX "sales_contacts_ip_address_idx" ON "sales_contacts"("ip_address");
