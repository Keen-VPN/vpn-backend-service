#!/usr/bin/env node

/**
 * Script to update a user's subscription status
 * Usage: node update-user-subscription.js [email] [status] [plan]
 * Example: node update-user-subscription.js demo@example.com active "Premium VPN"
 */

import UserSupabase from './models/UserSupabase.js';

async function updateUserSubscription(email, status = 'active', plan = 'Premium VPN Service') {
    try {
        console.log(`🚀 Updating subscription for: ${email}`);
        console.log(`📊 Status: ${status}, Plan: ${plan}`);
        
        const userModel = new UserSupabase();
        
        // Find the user by email
        const user = await userModel.findByEmail(email);
        
        if (!user) {
            console.log(`❌ User not found with email: ${email}`);
            console.log('💡 Available users:');
            
            // List some users for reference
            const supabase = userModel.supabase.getClient();
            const { data: users } = await supabase
                .from('users')
                .select('email, subscription_status, subscription_plan')
                .limit(10);
                
            if (users && users.length > 0) {
                users.forEach(u => {
                    console.log(`   - ${u.email} (${u.subscription_status || 'inactive'}) - ${u.subscription_plan || 'No plan'}`);
                });
            } else {
                console.log('   No users found in database');
            }
            return;
        }
        
        console.log(`✅ Found user: ${user.display_name} (ID: ${user.id})`);
        console.log(`📊 Current status: ${user.subscription_status || 'inactive'}`);
        
        // Prepare subscription data
        const subscriptionData = {
            status: status,
            plan: plan,
            customerId: user.stripe_customer_id || `demo_customer_${user.id}`
        };
        
        // Set end date based on status
        if (status === 'active') {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1); // 1 year from now
            subscriptionData.endDate = futureDate.toISOString();
        } else {
            subscriptionData.endDate = null;
        }
        
        console.log('🔄 Updating subscription...');
        const updatedUser = await userModel.updateSubscriptionStatus(user.id, subscriptionData);
        
        console.log('✅ Subscription updated successfully!');
        console.log('📊 Updated User Details:');
        console.log(`   - Email: ${updatedUser.email}`);
        console.log(`   - Display Name: ${updatedUser.display_name}`);
        console.log(`   - Subscription Status: ${updatedUser.subscription_status}`);
        console.log(`   - Subscription Plan: ${updatedUser.subscription_plan}`);
        console.log(`   - Subscription End Date: ${updatedUser.subscription_end_date || 'None'}`);
        console.log(`   - Stripe Customer ID: ${updatedUser.stripe_customer_id || 'None'}`);
        
    } catch (error) {
        console.error('❌ Error updating subscription:', error);
        throw error;
    }
}

// Get parameters from command line
const email = process.argv[2];
const status = process.argv[3] || 'active';
const plan = process.argv[4] || 'Premium VPN Service';

if (!email) {
    console.log('❌ Please provide an email address');
    console.log('Usage: node update-user-subscription.js [email] [status] [plan]');
    console.log('Example: node update-user-subscription.js demo@example.com active "Premium VPN"');
    process.exit(1);
}

// Run the script
updateUserSubscription(email, status, plan)
    .then(() => {
        console.log('\n🎉 Subscription update complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });



