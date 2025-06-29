import dotenv from 'dotenv';
import { getInstance } from './config/supabase.js';
import UserSupabase from './models/UserSupabase.js';

dotenv.config();

async function testSupabase() {
    console.log('🧪 Testing Supabase connection...\n');

    try {
        // Test 1: Initialize Supabase client
        console.log('1️⃣ Testing Supabase client initialization...');
        const supabase = getInstance();
        const client = supabase.getClient();
        console.log('✅ Supabase client initialized successfully\n');

        // Test 2: Test connection
        console.log('2️⃣ Testing database connection...');
        const isConnected = await supabase.testConnection();
        if (isConnected) {
            console.log('✅ Database connection successful\n');
        } else {
            console.log('❌ Database connection failed\n');
            return;
        }

        // Test 3: Test health check
        console.log('3️⃣ Testing health check...');
        const health = await supabase.healthCheck();
        console.log('Health status:', health);
        console.log('✅ Health check completed\n');

        // Test 4: Test user operations
        console.log('4️⃣ Testing user operations...');
        const userModel = new UserSupabase();

        // Test creating a user
        const testUser = {
            firebase_uid: 'test_firebase_uid_' + Date.now(),
            email: 'test@example.com',
            display_name: 'Test User'
        };

        console.log('Creating test user...');
        const createdUser = await userModel.createUser(testUser);
        console.log('✅ User created:', createdUser.id);

        // Test finding user by Firebase UID
        console.log('Finding user by Firebase UID...');
        const foundUser = await userModel.findByFirebaseUid(testUser.firebase_uid);
        console.log('✅ User found:', foundUser ? foundUser.id : 'Not found');

        // Test updating user
        console.log('Updating user...');
        const updatedUser = await userModel.updateUser(createdUser.id, {
            display_name: 'Updated Test User'
        });
        console.log('✅ User updated:', updatedUser.display_name);

        // Test subscription update
        console.log('Updating subscription...');
        const subscriptionData = {
            customerId: 'cus_test123',
            status: 'active',
            plan: 'premium',
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };

        const userWithSub = await userModel.updateSubscriptionStatus(createdUser.id, subscriptionData);
        console.log('✅ Subscription updated:', userWithSub.subscription_status);

        // Clean up - delete test user
        console.log('Cleaning up test user...');
        await userModel.deleteUser(createdUser.id);
        console.log('✅ Test user deleted\n');

        console.log('🎉 All tests passed! Supabase is working correctly.');

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
testSupabase(); 