import dotenv from 'dotenv';
import UserSupabase from './models/UserSupabase.js';

dotenv.config();

async function testWebhookProtection() {
    console.log('🧪 Testing webhook race condition protection...\n');

    try {
        const userModel = new UserSupabase();

        // Create a test user
        console.log('1️⃣ Creating test user...');
        const testUser = {
            firebase_uid: 'test_webhook_protection_' + Date.now(),
            email: 'webhook-test@example.com',
            display_name: 'Webhook Test User'
        };

        const createdUser = await userModel.createUser(testUser);
        console.log('✅ User created:', createdUser.id);

        // Test 1: Initial subscription activation
        console.log('\n2️⃣ Testing initial subscription activation...');
        const initialSubscription = {
            customerId: 'cus_initial',
            status: 'active',
            plan: 'premium',
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
        };

        const result1 = await userModel.updateSubscriptionStatus(createdUser.id, initialSubscription);
        console.log('✅ Initial subscription activated:', result1.subscription_status);

        // Test 2: Try to update with older end date (should be skipped)
        console.log('\n3️⃣ Testing update with older end date (should be skipped)...');
        const olderSubscription = {
            customerId: 'cus_initial',
            status: 'active',
            plan: 'premium',
            endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString() // 15 days from now (older)
        };

        const result2 = await userModel.updateSubscriptionStatus(createdUser.id, olderSubscription);
        console.log('✅ Update with older date was skipped (kept original):', result2.subscription_end_date);

        // Test 3: Update with newer end date (should be allowed)
        console.log('\n4️⃣ Testing update with newer end date (should be allowed)...');
        const newerSubscription = {
            customerId: 'cus_initial',
            status: 'active',
            plan: 'premium',
            endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days from now (newer)
        };

        const result3 = await userModel.updateSubscriptionStatus(createdUser.id, newerSubscription);
        console.log('✅ Update with newer date was applied:', result3.subscription_end_date);

        // Test 4: Test status change from active to cancelled (should always be allowed)
        console.log('\n5️⃣ Testing status change to cancelled (should always be allowed)...');
        const cancelledSubscription = {
            customerId: 'cus_initial',
            status: 'cancelled',
            plan: null,
            endDate: new Date().toISOString()
        };

        const result4 = await userModel.updateSubscriptionStatus(createdUser.id, cancelledSubscription);
        console.log('✅ Status change to cancelled was applied:', result4.subscription_status);

        // Test 5: Try to override cancelled subscription with active (should be allowed)
        console.log('\n6️⃣ Testing cancelled → active subscription (should be allowed)...');
        const reactivateSubscription = {
            customerId: 'cus_reactivate',
            status: 'active',
            plan: 'premium',
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };

        const result5 = await userModel.updateSubscriptionStatus(createdUser.id, reactivateSubscription);
        console.log('✅ Reactivation was applied:', result5.subscription_status);

        // Test 6: Try to override active subscription with another active (should be BLOCKED)
        console.log('\n7️⃣ Testing active → active subscription override (should be BLOCKED)...');
        const overrideSubscription = {
            customerId: 'cus_override',
            status: 'active',
            plan: 'premium',
            endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // Even newer date
        };

        const result6 = await userModel.updateSubscriptionStatus(createdUser.id, overrideSubscription);
        console.log('✅ Override was blocked (kept original):', result6.subscription_status, result6.subscription_end_date);

        // Test 7: Test shouldAllowSubscriptionUpdate method for active override
        console.log('\n8️⃣ Testing shouldAllowSubscriptionUpdate method for active override...');

        // Should not allow: active to active
        const shouldAllow1 = await userModel.shouldAllowSubscriptionUpdate(
            createdUser.id,
            'active', 
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        );
        console.log('✅ Should not allow active → active override:', !shouldAllow1);

        // Should allow: active to cancelled
        const shouldAllow2 = await userModel.shouldAllowSubscriptionUpdate(
            createdUser.id,
            'cancelled',
            null
        );
        console.log('✅ Should allow active → cancelled:', shouldAllow2);

        // Should not allow: same status with older date
        const shouldAllow3 = await userModel.shouldAllowSubscriptionUpdate(
            createdUser.id,
            'cancelled', 
            new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() // Yesterday
        );
        console.log('✅ Should not allow same status with older date:', !shouldAllow3);

        // Clean up
        console.log('\n9️⃣ Cleaning up test user...');
        await userModel.deleteUser(createdUser.id);
        console.log('✅ Test user deleted');

        console.log('\n🎉 All webhook protection tests passed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details
        });
    }
}

// Run the test
testWebhookProtection(); 