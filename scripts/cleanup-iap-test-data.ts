#!/usr/bin/env tsx
/**
 * Cleanup script to unlink all IAP purchases and optionally remove IAP subscriptions
 * Usage: tsx scripts/cleanup-iap-test-data.ts [--delete-subscriptions] [--delete-ledger]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupIAPTestData(options: {
  deleteSubscriptions: boolean;
  deleteLedger: boolean;
}) {
  console.log('🧹 Starting IAP test data cleanup...\n');

  try {
    // Step 1: Unlink all IAP purchases
    console.log('📦 Step 1: Unlinking all IAP purchases...');
    const unlinkResult = await prisma.appleIAPPurchase.updateMany({
      where: {
        linkedUserId: { not: null },
      },
      data: {
        linkedUserId: null,
        linkedEmail: null,
        linkedAt: null,
      },
    });
    console.log(`✅ Unlinked ${unlinkResult.count} IAP purchase(s)\n`);

    // Step 2: Optionally delete IAP-based subscriptions
    if (options.deleteSubscriptions) {
      console.log('🗑️  Step 2: Deleting IAP-based subscriptions...');
      const deleteSubscriptionsResult = await prisma.subscription.deleteMany({
        where: {
          subscriptionType: 'apple_iap',
        },
      });
      console.log(`✅ Deleted ${deleteSubscriptionsResult.count} IAP subscription(s)\n`);
    } else {
      console.log('⏭️  Step 2: Skipping subscription deletion (use --delete-subscriptions to enable)\n');
    }

    // Step 3: Optionally delete all IAP purchase ledger entries
    if (options.deleteLedger) {
      console.log('🗑️  Step 3: Deleting all IAP purchase ledger entries...');
      const deleteLedgerResult = await prisma.appleIAPPurchase.deleteMany({});
      console.log(`✅ Deleted ${deleteLedgerResult.count} IAP purchase ledger entry/entries\n`);
    } else {
      console.log('⏭️  Step 3: Skipping ledger deletion (use --delete-ledger to enable)\n');
    }

    // Summary
    const remainingLinked = await prisma.appleIAPPurchase.count({
      where: { linkedUserId: { not: null } },
    });
    const remainingSubscriptions = await prisma.subscription.count({
      where: { subscriptionType: 'apple_iap' },
    });
    const remainingLedgerEntries = await prisma.appleIAPPurchase.count({});

    console.log('📊 Cleanup Summary:');
    console.log(`   - Remaining linked purchases: ${remainingLinked}`);
    console.log(`   - Remaining IAP subscriptions: ${remainingSubscriptions}`);
    console.log(`   - Remaining ledger entries: ${remainingLedgerEntries}`);
    console.log('\n✅ Cleanup completed successfully!');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const deleteSubscriptions = args.includes('--delete-subscriptions');
const deleteLedger = args.includes('--delete-ledger');

// Safety check for production
if (process.env.NODE_ENV === 'production' && (deleteSubscriptions || deleteLedger)) {
  console.error('❌ ERROR: Cannot delete data in production environment!');
  console.error('   Set NODE_ENV to "development" or "test" to run cleanup.');
  process.exit(1);
}

// Confirm destructive operations
if (deleteSubscriptions || deleteLedger) {
  console.log('⚠️  WARNING: This will permanently delete data!');
  console.log('   - Delete subscriptions:', deleteSubscriptions);
  console.log('   - Delete ledger entries:', deleteLedger);
  console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
}

// Run cleanup
cleanupIAPTestData({
  deleteSubscriptions,
  deleteLedger,
})
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });


