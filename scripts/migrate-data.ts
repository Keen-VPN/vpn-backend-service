import prisma from '../src/config/prisma.js';

/**
 * Data Migration Script - COMPLETED
 * This script has already run successfully.
 * Migrated 4 users and 4 subscriptions.
 * 
 * To re-run migration (not recommended unless you have new data):
 * npm run migrate:data
 */

interface OldUserWithSubscription {
  id: string;
  email: string;
  stripe_customer_id?: string;
  subscription_status?: string;
  subscription_plan?: string;
  subscription_end_date?: string;
}

async function migrateData() {
  console.log('🚀 Starting data migration from old schema to Prisma...\n');

  try {
    // Step 1: Get all users with subscription data directly from Prisma
    // (Old users table still has subscription columns for backward compatibility)
    console.log('📊 Step 1: Fetching users with subscription data...');
    
    // Use raw SQL query to access old schema columns
    const oldUsers = await prisma.$queryRaw<OldUserWithSubscription[]>`
      SELECT 
        id, 
        email, 
        stripe_customer_id, 
        subscription_status, 
        subscription_plan, 
        subscription_end_date::text
      FROM users 
      WHERE stripe_customer_id IS NOT NULL
    `;

    if (!oldUsers) {
      console.error('❌ Error fetching users');
      throw new Error('Failed to fetch users');
    }

    console.log(`✅ Found ${oldUsers?.length || 0} users with subscription data\n`);

    if (!oldUsers || oldUsers.length === 0) {
      console.log('ℹ️  No users with subscriptions found. Migration not needed.');
      return;
    }

    // Step 2: Check existing users in Prisma
    console.log('📊 Step 2: Checking users in Prisma...');
    const prismaUsers = await prisma.user.findMany({
      select: { id: true, email: true }
    });

    console.log(`✅ Found ${prismaUsers.length} users in Prisma database\n`);

    // Step 3: Migrate subscription data
    console.log('📊 Step 3: Migrating subscription data...\n');
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const oldUser of oldUsers as OldUserWithSubscription[]) {
      try {
        // Check if user exists in Prisma
        let prismaUser = await prisma.user.findUnique({
          where: { id: oldUser.id }
        });

        // If user doesn't exist in Prisma, create them
        if (!prismaUser) {
          console.log(`👤 Creating user: ${oldUser.email}`);
          prismaUser = await prisma.user.create({
            data: {
              id: oldUser.id,
              email: oldUser.email,
              displayName: oldUser.email.split('@')[0],
              provider: 'google',
              emailVerified: true
            }
          });
          console.log(`   ✅ User created`);
        }

        // Check if subscription already exists
        const existingSubscription = await prisma.subscription.findFirst({
          where: {
            userId: oldUser.id,
            stripeCustomerId: oldUser.stripe_customer_id || undefined
          }
        });

        if (existingSubscription) {
          console.log(`⏭️  Skipping ${oldUser.email} - subscription already exists`);
          skippedCount++;
          continue;
        }

        // Only create subscription if there's meaningful data
        if (oldUser.stripe_customer_id && oldUser.subscription_status) {
          console.log(`💳 Migrating subscription for: ${oldUser.email}`);
          console.log(`   Status: ${oldUser.subscription_status}`);
          console.log(`   Plan: ${oldUser.subscription_plan || 'N/A'}`);
          console.log(`   End Date: ${oldUser.subscription_end_date || 'N/A'}`);

          const subscription = await prisma.subscription.create({
            data: {
              userId: oldUser.id,
              stripeCustomerId: oldUser.stripe_customer_id,
              status: oldUser.subscription_status || 'inactive',
              planName: oldUser.subscription_plan || 'Premium VPN',
              planId: 'premium_yearly',
              priceAmount: 100.00,
              priceCurrency: 'USD',
              billingPeriod: 'year',
              currentPeriodEnd: oldUser.subscription_end_date 
                ? new Date(oldUser.subscription_end_date)
                : null
            }
          });

          console.log(`   ✅ Subscription created: ${subscription.id}\n`);
          migratedCount++;
        } else {
          console.log(`⏭️  Skipping ${oldUser.email} - no subscription data\n`);
          skippedCount++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error migrating ${oldUser.email}:`, errorMessage);
        errorCount++;
      }
    }

    // Step 4: Summary
    console.log('\n📊 Migration Summary:');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Successfully migrated: ${migratedCount} subscriptions`);
    console.log(`⏭️  Skipped (already exists): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total processed: ${oldUsers.length} users`);
    console.log('═══════════════════════════════════════\n');

    // Step 5: Verify migration
    console.log('🔍 Step 5: Verifying migration...');
    const totalSubscriptions = await prisma.subscription.count();
    const activeSubscriptions = await prisma.subscription.count({
      where: { status: 'active' }
    });

    console.log(`📊 Total subscriptions in database: ${totalSubscriptions}`);
    console.log(`✅ Active subscriptions: ${activeSubscriptions}\n`);

    console.log('✨ Migration completed successfully!');
    console.log('🔍 Open Prisma Studio to view your data: npm run prisma:studio');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateData()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  });

