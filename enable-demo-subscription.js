#!/usr/bin/env node

/**
 * Script to enable active subscription for a demo user
 * Usage: node enable-demo-subscription.js [email]
 */

import { getInstance } from './config/supabase.js';
import UserSupabase from './models/UserSupabase.js';

async function enableDemoSubscription(email = 'demo@example.com') {
    try {
        console.log(`🚀 Enabling demo subscription for: ${email}`);
        
        const userModel = new UserSupabase();
        
        // First, try to find the user by email
        let user = await userModel.findByEmail(email);
        
        if (!user) {
            console.log(`👤 User not found with email: ${email}`);
            console.log('📝 Creating demo user...');
            
            // Create a demo user
            user = await userModel.createUser({
                firebase_uid: `demo_${Date.now()}`, // Generate a unique demo UID
                email: email,
                display_name: 'Demo User'
            });
            
            console.log(`✅ Demo user created with ID: ${user.id}`);
        } else {
            console.log(`✅ Found existing user with ID: ${user.id}`);
        }
        
        // Set subscription to active with a future end date
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1); // 1 year from now
        
        const subscriptionData = {
            status: 'active',
            plan: 'Premium VPN Service',
            endDate: futureDate.toISOString(),
            customerId: `demo_customer_${user.id}` // Demo customer ID
        };
        
        console.log('🔄 Updating subscription status...');
        const updatedUser = await userModel.updateSubscriptionStatus(user.id, subscriptionData);
        
        console.log('✅ Demo subscription enabled successfully!');
        console.log('📊 User Details:');
        console.log(`   - ID: ${updatedUser.id}`);
        console.log(`   - Email: ${updatedUser.email}`);
        console.log(`   - Display Name: ${updatedUser.display_name}`);
        console.log(`   - Subscription Status: ${updatedUser.subscription_status}`);
        console.log(`   - Subscription Plan: ${updatedUser.subscription_plan}`);
        console.log(`   - Subscription End Date: ${updatedUser.subscription_end_date}`);
        console.log(`   - Stripe Customer ID: ${updatedUser.stripe_customer_id}`);
        
        // Generate a demo session token for testing
        const jwt = await import('jsonwebtoken');
        const sessionToken = jwt.default.sign({
            userId: updatedUser.id,
            email: updatedUser.email,
            type: 'permanent'
        }, process.env.JWT_SECRET || 'demo-secret-key', { expiresIn: '1y' });
        
        console.log('\n🔑 Demo Session Token (for testing):');
        console.log(sessionToken);
        console.log('\n💡 You can use this token in your iOS app for testing VPN connections.');
        
    } catch (error) {
        console.error('❌ Error enabling demo subscription:', error);
        process.exit(1);
    }
}

// Get email from command line arguments or use default
const email = process.argv[2] || 'demo@example.com';

// Check if JWT_SECRET is set
if (!process.env.JWT_SECRET) {
    console.log('⚠️  JWT_SECRET not set, using demo secret key');
    process.env.JWT_SECRET = 'demo-secret-key';
}

// Run the script
enableDemoSubscription(email)
    .then(() => {
        console.log('\n🎉 Demo subscription setup complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });
