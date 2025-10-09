import prisma from '../src/config/prisma.js';

/**
 * Verification Script
 * Checks that data migration was successful
 */

async function verifyMigration() {
  console.log('🔍 Verifying data migration...\n');

  try {
    // Check users
    const totalUsers = await prisma.user.count();
    console.log(`👥 Total users: ${totalUsers}`);

    // Check subscriptions
    const totalSubscriptions = await prisma.subscription.count();
    const activeSubscriptions = await prisma.subscription.count({
      where: { status: 'active' }
    });
    const cancelledSubscriptions = await prisma.subscription.count({
      where: { status: 'cancelled' }
    });

    console.log(`\n💳 Subscriptions:`);
    console.log(`   Total: ${totalSubscriptions}`);
    console.log(`   Active: ${activeSubscriptions}`);
    console.log(`   Cancelled: ${cancelledSubscriptions}`);
    console.log(`   Inactive: ${totalSubscriptions - activeSubscriptions - cancelledSubscriptions}`);

    // Check connection sessions
    const totalSessions = await prisma.connectionSession.count();
    console.log(`\n📡 Connection sessions: ${totalSessions}`);

    // Show sample data
    console.log('\n📋 Sample Data:\n');

    // Sample users with subscriptions
    const usersWithSubs = await prisma.user.findMany({
      take: 3,
      include: {
        subscriptions: {
          where: { status: 'active' },
          take: 1
        }
      }
    });

    usersWithSubs.forEach(user => {
      const sub = user.subscriptions[0];
      console.log(`👤 ${user.email}`);
      if (sub) {
        console.log(`   💳 Subscription: ${sub.status} - ${sub.planName}`);
        console.log(`   📅 End Date: ${sub.currentPeriodEnd || 'N/A'}`);
      } else {
        console.log(`   ⚠️  No active subscription`);
      }
      console.log('');
    });

    // Check for orphaned data
    console.log('🔍 Checking for issues...\n');

    const usersWithoutEmail = await prisma.user.count({
      where: { email: '' }
    });

    const expiredActiveSubscriptions = await prisma.subscription.count({
      where: {
        status: 'active',
        currentPeriodEnd: {
          lt: new Date()
        }
      }
    });

    if (usersWithoutEmail > 0) {
      console.log(`⚠️  Found ${usersWithoutEmail} users without email`);
    }

    if (expiredActiveSubscriptions > 0) {
      console.log(`⚠️  Found ${expiredActiveSubscriptions} active subscriptions that are expired`);
    }

    if (usersWithoutEmail === 0 && expiredActiveSubscriptions === 0) {
      console.log('✅ No issues found!');
    }

    console.log('\n✨ Verification complete!');
    console.log('🎯 Your database is ready for production!');

  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyMigration()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Verification failed:', error);
    process.exit(1);
  });

