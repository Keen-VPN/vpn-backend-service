import prisma from "../config/prisma.js";
import type {
  AppleIAPPurchaseLedgerEntry,
  CaptureAppleIAPRequest,
} from "../types/index.js";

export interface CapturePurchaseInput
  extends Omit<CaptureAppleIAPRequest, "purchaseDateMs" | "expiresDateMs"> {
  purchaseDate: Date;
  expiresDate?: Date | null;
}

const ledgerEntryFromRecord = (record: any): AppleIAPPurchaseLedgerEntry => ({
  transactionId: record.apple_transaction_id ?? record.transactionId,
  originalTransactionId:
    record.apple_original_transaction_id ?? record.originalTransactionId,
  productId: record.apple_product_id ?? record.productId,
  environment: (record.apple_environment ?? record.environment) as
    | "Sandbox"
    | "Production"
    | null
    | undefined,
  purchaseDate: (record.purchase_date ?? record.purchaseDate).toISOString(),
  expiresDate: record.expires_date
    ? new Date(record.expires_date).toISOString()
    : record.expiresDate
    ? new Date(record.expiresDate).toISOString()
    : null,
  linkedUserId: record.linked_user_id ?? record.linkedUserId ?? null,
  linkedEmail: record.linked_email ?? record.linkedEmail ?? null,
  linkedAt: record.linked_at
    ? new Date(record.linked_at).toISOString()
    : record.linkedAt
    ? new Date(record.linkedAt).toISOString()
    : null,
});

class AppleIAPPurchaseModel {
  async recordCapture(input: CapturePurchaseInput) {
    const {
      transactionId,
      originalTransactionId,
      productId,
      environment,
      purchaseDate,
      expiresDate,
      receiptData,
    } = input;

    const existingByOriginal = await prisma.appleIAPPurchase.findUnique({
      where: { originalTransactionId },
    });

    if (existingByOriginal) {
      const earliestPurchase =
        existingByOriginal.purchaseDate &&
        existingByOriginal.purchaseDate < purchaseDate
          ? existingByOriginal.purchaseDate
          : purchaseDate;

      let resolvedExpiresDate = expiresDate ?? existingByOriginal.expiresDate;
      if (expiresDate && existingByOriginal.expiresDate) {
        resolvedExpiresDate =
          expiresDate > existingByOriginal.expiresDate
            ? expiresDate
            : existingByOriginal.expiresDate;
      }

      const resolvedEnvironment =
        environment ?? existingByOriginal.environment ?? null;

      const update = await prisma.appleIAPPurchase.update({
        where: { originalTransactionId },
        data: {
          transactionId,
          productId,
          environment: resolvedEnvironment,
          purchaseDate: earliestPurchase,
          expiresDate: resolvedExpiresDate,
          receiptData: receiptData ?? existingByOriginal.receiptData,
        },
      });

      return ledgerEntryFromRecord(update);
    }

    const existingByTransaction = await prisma.appleIAPPurchase.findUnique({
      where: { transactionId },
    });

    if (existingByTransaction) {
      const earliestPurchase =
        existingByTransaction.purchaseDate &&
        existingByTransaction.purchaseDate < purchaseDate
          ? existingByTransaction.purchaseDate
          : purchaseDate;

      let resolvedExpiresDate =
        expiresDate ?? existingByTransaction.expiresDate;
      if (expiresDate && existingByTransaction.expiresDate) {
        resolvedExpiresDate =
          expiresDate > existingByTransaction.expiresDate
            ? expiresDate
            : existingByTransaction.expiresDate;
      }

      const resolvedEnvironment =
        environment ?? existingByTransaction.environment ?? null;

      const resolvedOriginalTransactionId =
        existingByTransaction.originalTransactionId &&
        existingByTransaction.originalTransactionId !== originalTransactionId
          ? existingByTransaction.originalTransactionId
          : originalTransactionId;

      const update = await prisma.appleIAPPurchase.update({
        where: { transactionId },
        data: {
          originalTransactionId: resolvedOriginalTransactionId,
          productId,
          environment: resolvedEnvironment,
          purchaseDate: earliestPurchase,
          expiresDate: resolvedExpiresDate,
          receiptData: receiptData ?? existingByTransaction.receiptData,
        },
      });

      return ledgerEntryFromRecord(update);
    }

    const created = await prisma.appleIAPPurchase.create({
      data: {
        transactionId,
        originalTransactionId,
        productId,
        environment,
        purchaseDate,
        expiresDate,
        receiptData,
      },
    });

    return ledgerEntryFromRecord(created);
  }

  async findByOriginalTransactionId(originalTransactionId: string) {
    const record = await prisma.appleIAPPurchase.findUnique({
      where: { originalTransactionId },
    });
    return record ? ledgerEntryFromRecord(record) : null;
  }

  async findByTransactionId(transactionId: string) {
    const record = await prisma.appleIAPPurchase.findFirst({
      where: { transactionId },
    });
    return record ? ledgerEntryFromRecord(record) : null;
  }

  async markLinked(
    originalTransactionId: string,
    linkedUserId: string,
    linkedEmail: string | null
  ) {
    const record = await prisma.appleIAPPurchase.update({
      where: { originalTransactionId },
      data: {
        linkedUserId,
        linkedEmail,
        linkedAt: new Date(),
      },
    });
    return ledgerEntryFromRecord(record);
  }

  /**
   * Unlink a purchase (rollback operation)
   */
  async unlink(originalTransactionId: string) {
    const record = await prisma.appleIAPPurchase.update({
      where: { originalTransactionId },
      data: {
        linkedUserId: null,
        linkedEmail: null,
        linkedAt: null,
      },
    });
    return ledgerEntryFromRecord(record);
  }

  /**
   * Find all unlinked Apple IAP purchases (where linkedUserId is null)
   * Optionally filter by expiration date to only get active purchases
   */
  async findUnlinkedPurchases(onlyActive: boolean = true) {
    const now = new Date();
    const records = await prisma.appleIAPPurchase.findMany({
      where: {
        linkedUserId: null,
        ...(onlyActive
          ? {
              OR: [{ expiresDate: null }, { expiresDate: { gt: now } }],
            }
          : {}),
      },
      orderBy: { purchaseDate: "desc" },
    });
    return records.map(ledgerEntryFromRecord);
  }

  /**
   * Find all Apple IAP purchases by user ID for history
   */
  async findByUserId(userId: string) {
    const records = await prisma.appleIAPPurchase.findMany({
      where: { linkedUserId: userId },
      orderBy: { purchaseDate: "desc" },
    });
    return records.map(ledgerEntryFromRecord);
  }
}

export default AppleIAPPurchaseModel;
