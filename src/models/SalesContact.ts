import prisma from "../config/prisma.js";
import type {
  CreateSalesContactData,
  UpdateSalesContactData,
} from "../types/index.js";

// Type alias for SalesContact from Prisma (non-nullable version)
type PrismaSalesContactNonNull = NonNullable<
  Awaited<ReturnType<typeof prisma.salesContact.findUnique>>
>;

/**
 * SalesContact Model - Manages enterprise sales contact requests
 * TypeScript + Prisma ORM for full type safety
 */
class SalesContact {
  /**
   * Generate a human-readable reference ID
   * Format: SC-YYYYMMDD-XXXX (SC = Sales Contact)
   */
  private generateReferenceId(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    // Generate 4-digit random number
    const random = Math.floor(1000 + Math.random() * 9000);

    return `SC-${year}${month}${day}-${random}`;
  }

  /**
   * Create a new sales contact request
   */
  async create(
    salesContactData: CreateSalesContactData
  ): Promise<PrismaSalesContactNonNull> {
    try {
      // Generate a unique reference ID
      let referenceId: string;
      let attempts = 0;
      const maxAttempts = 10;

      do {
        referenceId = this.generateReferenceId();
        const existing = await prisma.salesContact.findUnique({
          where: { referenceId },
        });

        if (!existing) break;
        attempts++;

        if (attempts >= maxAttempts) {
          throw new Error(
            "Unable to generate unique reference ID after multiple attempts"
          );
        }
      } while (attempts < maxAttempts);

      const salesContact = await prisma.salesContact.create({
        data: {
          referenceId,
          companyName: salesContactData.companyName.trim(),
          workEmail: salesContactData.workEmail.trim().toLowerCase(),
          teamSize: salesContactData.teamSize,
          countryRegion: salesContactData.countryRegion?.trim() || null,
          hasConsent: salesContactData.hasConsent,
          phone: salesContactData.phone?.trim() || null,
          useCase: salesContactData.useCase?.trim() || null,
          preferredContactMethod:
            salesContactData.preferredContactMethod?.trim() || null,
          preferredContactTime:
            salesContactData.preferredContactTime?.trim() || null,
          message: salesContactData.message?.trim() || null,
          ipAddress: salesContactData.ipAddress || null,
          userAgent: salesContactData.userAgent || null,
          status: "pending",
          salesTeamNotified: false,
          customerConfirmationSent: false,
        },
      });

      console.log(
        "✅ Sales contact created successfully:",
        salesContact.referenceId
      );
      return salesContact;
    } catch (error) {
      console.error("❌ Failed to create sales contact:", error);
      throw error;
    }
  }

  /**
   * Find sales contact by ID
   */
  async findById(id: string): Promise<PrismaSalesContactNonNull | null> {
    try {
      console.log("🔍 Searching for sales contact by ID:", id);
      const salesContact = await prisma.salesContact.findUnique({
        where: { id },
      });

      if (salesContact) {
        console.log("✅ Found sales contact:", salesContact.referenceId);
      } else {
        console.log("🔍 No sales contact found with ID:", id);
      }

      return salesContact;
    } catch (error) {
      console.error("❌ Failed to find sales contact by ID:", error);
      throw error;
    }
  }

  /**
   * Find sales contact by reference ID
   */
  async findByReferenceId(
    referenceId: string
  ): Promise<PrismaSalesContactNonNull | null> {
    try {
      console.log(
        "🔍 Searching for sales contact by reference ID:",
        referenceId
      );
      const salesContact = await prisma.salesContact.findUnique({
        where: { referenceId },
      });

      if (salesContact) {
        console.log("✅ Found sales contact:", salesContact.id);
      } else {
        console.log(
          "🔍 No sales contact found with reference ID:",
          referenceId
        );
      }

      return salesContact;
    } catch (error) {
      console.error("❌ Failed to find sales contact by reference ID:", error);
      throw error;
    }
  }

  /**
   * Check for recent duplicate requests from same email or IP
   * Used for spam protection
   */
  async checkForDuplicates(
    email: string,
    ipAddress?: string,
    timeWindowMinutes: number = 15
  ): Promise<PrismaSalesContactNonNull[]> {
    try {
      const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

      console.log("🔍 Checking for duplicate sales contacts:", {
        email,
        ipAddress,
        since: cutoffTime.toISOString(),
      });

      const duplicates = await prisma.salesContact.findMany({
        where: {
          createdAt: {
            gte: cutoffTime,
          },
          OR: [
            { workEmail: email.trim().toLowerCase() },
            ...(ipAddress ? [{ ipAddress }] : []),
          ],
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (duplicates.length > 0) {
        console.log(
          "🚨 Found potential duplicate contacts:",
          duplicates.length
        );
        duplicates.forEach((dup) => {
          console.log(
            `🚨 Duplicate: ${dup.referenceId} (${dup.workEmail}) at ${dup.createdAt}`
          );
        });
      } else {
        console.log("✅ No duplicates found");
      }

      return duplicates;
    } catch (error) {
      console.error("❌ Failed to check for duplicates:", error);
      throw error;
    }
  }

  /**
   * Update sales contact
   */
  async update(
    id: string,
    updateData: UpdateSalesContactData
  ): Promise<PrismaSalesContactNonNull> {
    try {
      console.log("📝 Updating sales contact:", id);

      const salesContact = await prisma.salesContact.update({
        where: { id },
        data: updateData,
      });

      console.log(
        "✅ Sales contact updated successfully:",
        salesContact.referenceId
      );
      return salesContact;
    } catch (error) {
      console.error("❌ Failed to update sales contact:", error);
      throw error;
    }
  }

  /**
   * Get recent sales contacts for analytics/admin
   */
  async getRecent(limit: number = 50): Promise<PrismaSalesContactNonNull[]> {
    try {
      console.log("🔍 Fetching recent sales contacts, limit:", limit);

      const contacts = await prisma.salesContact.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
      });

      console.log("✅ Retrieved", contacts.length, "recent sales contacts");
      return contacts;
    } catch (error) {
      console.error("❌ Failed to get recent sales contacts:", error);
      throw error;
    }
  }

  /**
   * Mark sales team as notified
   */
  async markSalesTeamNotified(id: string): Promise<PrismaSalesContactNonNull> {
    try {
      console.log("📧 Marking sales team as notified for:", id);

      const salesContact = await this.update(id, {
        salesTeamNotified: true,
      });

      console.log(
        "✅ Sales team notification marked for:",
        salesContact.referenceId
      );
      return salesContact;
    } catch (error) {
      console.error("❌ Failed to mark sales team notified:", error);
      throw error;
    }
  }

  /**
   * Mark customer confirmation as sent
   */
  async markCustomerConfirmationSent(
    id: string
  ): Promise<PrismaSalesContactNonNull> {
    try {
      console.log("📧 Marking customer confirmation as sent for:", id);

      const salesContact = await this.update(id, {
        customerConfirmationSent: true,
      });

      console.log(
        "✅ Customer confirmation marked for:",
        salesContact.referenceId
      );
      return salesContact;
    } catch (error) {
      console.error("❌ Failed to mark customer confirmation sent:", error);
      throw error;
    }
  }
}

export default SalesContact;
