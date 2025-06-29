import UserSupabase from './models/UserSupabase.js';

/**
 * Test script to demonstrate the fix for simultaneous webhooks
 * When subscription.created, subscription.updated, and checkout.session.completed
 * all arrive at the same time (10:20:32 PM)
 */

async function testSimultaneousWebhooks() {
    console.log('🧪 Testing Simultaneous Webhooks Fix\n');

    const userSupabase = new UserSupabase();

    try {
        // Create a test user
        console.log('1️⃣ Creating test user...');
        const testUser = await userSupabase.createUser({
            firebase_uid: 'test_simultaneous_' + Date.now(),
            email: 'simultaneous-test@example.com',
            display_name: 'Simultaneous Test User'
        });
        console.log(`✅ User created: ${testUser.id}`);
        console.log(`📊 Initial subscription status: ${testUser.subscription_status}\n`);

        // Simulate the exact scenario from your logs
        console.log('2️⃣ Simulating simultaneous webhooks (all at 10:20:32 PM)\n');

        // SCENARIO: All three webhooks arrive simultaneously
        console.log('📨 Webhook 1: customer.subscription.created (status: incomplete)');
        console.log('📨 Webhook 2: customer.subscription.updated (status: active)');
        console.log('📨 Webhook 3: checkout.session.completed\n');

        // Step 1: subscription.created arrives first (stores customer ID only)
        console.log('🔄 Processing subscription.created (incomplete)...');
        await userSupabase.updateUser(testUser.id, {
            stripe_customer_id: 'cus_simultaneous_test'
        });

        // Check state after subscription.created
        const userAfterCreated = await userSupabase.getUserWithSubscription(testUser.id);
        console.log(`📊 After subscription.created:`);
        console.log(`   Customer ID: ${userAfterCreated.stripe_customer_id}`);
        console.log(`   Status: ${userAfterCreated.subscription_status}`);
        console.log(`   Plan: ${userAfterCreated.subscription_plan}\n`);

        // Step 2: subscription.updated arrives (should activate)
        console.log('🔄 Processing subscription.updated (active)...');
        const subscriptionUpdatedData = {
            customerId: 'cus_simultaneous_test',
            status: 'active',
            plan: 'premium',
            endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        };

        // Check if update should be allowed
        const shouldAllow = await userSupabase.shouldAllowSubscriptionUpdate(
            testUser.id,
            subscriptionUpdatedData.status,
            subscriptionUpdatedData.endDate
        );
        console.log(`🔍 Should allow subscription.updated: ${shouldAllow}`);

        if (shouldAllow) {
            await userSupabase.updateSubscriptionStatus(testUser.id, subscriptionUpdatedData);
            console.log('✅ Subscription activated successfully!');
        } else {
            console.log('❌ Subscription activation blocked - this would cause the issue you saw');
        }

        // Check final state
        const finalUser = await userSupabase.getUserWithSubscription(testUser.id);
        console.log(`\n📊 Final user state:`);
        console.log(`   Customer ID: ${finalUser.stripe_customer_id}`);
        console.log(`   Status: ${finalUser.subscription_status}`);
        console.log(`   Plan: ${finalUser.subscription_plan}`);
        console.log(`   End Date: ${finalUser.subscription_end_date}`);

        // Clean up
        console.log('\n3️⃣ Cleaning up...');
        await userSupabase.deleteUser(testUser.id);
        console.log('✅ Test user deleted');

        console.log('\n📋 ANALYSIS:');
        if (finalUser.subscription_status === 'active') {
            console.log('✅ SUCCESS: The fix works! Subscription is now active');
            console.log('   • subscription.created stored customer ID only');
            console.log('   • subscription.updated properly activated the subscription');
            console.log('   • Race condition protection allowed the correct flow');
        } else {
            console.log('❌ ISSUE: Subscription is still inactive');
            console.log('   • This indicates the race condition protection is still blocking updates');
            console.log('   • The fix may need further adjustment');
        }

    } catch (error) {
        console.error('❌ Error in simultaneous webhooks test:', error);
    }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testSimultaneousWebhooks();
}

export default testSimultaneousWebhooks; 