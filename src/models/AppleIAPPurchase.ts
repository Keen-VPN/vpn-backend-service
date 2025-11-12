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

const ledgerEntryFromRecord = (
  record: any
): AppleIAPPurchaseLedgerEntry => ({
  transactionId: record.apple_transaction_id ?? record.transactionId,
  originalTransactionId:
    record.apple_original_transaction_id ?? record.originalTransactionId,
  productId: record.apple_product_id ?? record.productId,
  environment: (record.apple_environment ??
    record.environment) as "Sandbox" | "Production" | null | undefined,
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

    const existing = await prisma.appleIAPPurchase.findUnique({
      where: { originalTransactionId },
    });

    if (existing) {
      const earliestPurchase =
        existing.purchaseDate && existing.purchaseDate < purchaseDate
          ? existing.purchaseDate
          : purchaseDate;

      let resolvedExpiresDate = expiresDate ?? existing.expiresDate;
      if (expiresDate && existing.expiresDate) {
        resolvedExpiresDate =
          expiresDate > existing.expiresDate ? expiresDate : existing.expiresDate;
      }

      const resolvedEnvironment =
        environment ?? existing.environment ?? null;

      const update = await prisma.appleIAPPurchase.update({
        where: { originalTransactionId },
        data: {
          transactionId,
          productId,
          environment: resolvedEnvironment,
          purchaseDate: earliestPurchase,
          expiresDate: resolvedExpiresDate,
          receiptData: receiptData ?? existing.receiptData,
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
}

export default AppleIAPPurchaseModel;

