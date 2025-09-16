#!/usr/bin/env node

/**
 * Script to list all users and their subscription statuses
 * Usage: node list-users.js
 */

import { getInstance } from './config/supabase.js';

async function listUsers() {
    try {
        console.log('👥 Listing all users and their subscription statuses...\n');
        
        const supabase = getInstance().getClient();
        
        const { data: users, error } = await supabase
            .from('users')
            .select('id, email, display_name, subscription_status, subscription_plan, subscription_end_date, stripe_customer_id, created_at')
            .order('created_at', { ascending: false });
        
        if (error) {
            throw error;
        }
        
        if (!users || users.length === 0) {
            console.log('📭 No users found in the database');
            return;
        }
        
        console.log(`📊 Found ${users.length} user(s):\n`);
        
        users.forEach((user, index) => {
            const endDate = user.subscription_end_date ? 
                new Date(user.subscription_end_date).toLocaleDateString() : 
                'None';
                
            const status = user.subscription_status || 'inactive';
            const statusIcon = status === 'active' ? '✅' : '❌';
            
            console.log(`${index + 1}. ${statusIcon} ${user.display_name || 'No name'}`);
            console.log(`   📧 Email: ${user.email}`);
            console.log(`   🆔 ID: ${user.id}`);
            console.log(`   📊 Status: ${status}`);
            console.log(`   📦 Plan: ${user.subscription_plan || 'None'}`);
            console.log(`   📅 End Date: ${endDate}`);
            console.log(`   💳 Customer ID: ${user.stripe_customer_id || 'None'}`);
            console.log(`   📅 Created: ${new Date(user.created_at).toLocaleDateString()}`);
            console.log('');
        });
        
        // Summary
        const activeUsers = users.filter(u => u.subscription_status === 'active').length;
        const inactiveUsers = users.length - activeUsers;
        
        console.log('📈 Summary:');
        console.log(`   ✅ Active subscriptions: ${activeUsers}`);
        console.log(`   ❌ Inactive subscriptions: ${inactiveUsers}`);
        console.log(`   👥 Total users: ${users.length}`);
        
    } catch (error) {
        console.error('❌ Error listing users:', error);
        throw error;
    }
}

// Run the script
listUsers()
    .then(() => {
        console.log('\n🎉 User listing complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });



