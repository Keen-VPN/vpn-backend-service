import { getInstance } from '../config/supabase.js';

class UserSupabase {
    constructor() {
        this.supabase = getInstance();
    }

    // Create a new user
    async createUser(userData) {
        try {
            const client = this.supabase.getClient();

            const { data, error } = await client
                .from('users')
                .insert([{
                    firebase_uid: userData.firebase_uid,
                    email: userData.email,
                    display_name: userData.display_name,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (error) {
                console.error('Error creating user:', error);
                throw error;
            }

            console.log('✅ User created successfully:', data.id);
            return data;
        } catch (error) {
            console.error('❌ Failed to create user:', error);
            throw error;
        }
    }

    // Find user by Firebase UID
    async findByFirebaseUid(firebaseUid) {
        try {
            const client = this.supabase.getClient();

            const { data, error } = await client
                .from('users')
                .select('*')
                .eq('firebase_uid', firebaseUid)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // No rows returned
                    return null;
                }
                throw error;
            }

            return data;
        } catch (error) {
            console.error('❌ Failed to find user by Firebase UID:', error);
            throw error;
        }
    }

    // Find user by email
    async findByEmail(email) {
        try {
            const client = this.supabase.getClient();

            const { data, error } = await client
                .from('users')
                .select('*')
                .eq('email', email)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // No rows returned
                    return null;
                }
                throw error;
            }

            return data;
        } catch (error) {
            console.error('❌ Failed to find user by email:', error);
            throw error;
        }
    }

    // Find user by Stripe Customer ID
    async findByStripeCustomerId(customerId) {
        try {
            const client = this.supabase.getClient();

            const { data, error } = await client
                .from('users')
                .select('*')
                .eq('stripe_customer_id', customerId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return null;
                }
                throw error;
            }

            return data;
        } catch (error) {
            console.error('❌ Failed to find user by Stripe Customer ID:', error);
            throw error;
        }
    }

    // Find user by ID
    async findById(userId) {
        try {
            const client = this.supabase.getClient();

            const { data, error } = await client
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return null;
                }
                throw error;
            }

            return data;
        } catch (error) {
            console.error('❌ Failed to find user by ID:', error);
            throw error;
        }
    }

    // Update user
    async updateUser(userId, updateData) {
        try {
            const client = this.supabase.getClient();

            const { data, error } = await client
                .from('users')
                .update({
                    ...updateData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)
                .select()
                .single();

            if (error) {
                console.error('Error updating user:', error);
                throw error;
            }

            console.log('✅ User updated successfully:', data.id);
            return data;
        } catch (error) {
            console.error('❌ Failed to update user:', error);
            throw error;
        }
    }

    // Update subscription status with race condition protection
    async updateSubscriptionStatus(userId, subscriptionData) {
        try {
            const client = this.supabase.getClient();

            // First, get the current user data to check if update is needed
            const currentUser = await this.getUserWithSubscription(userId);
            if (!currentUser) {
                throw new Error('User not found');
            }

            // CRITICAL: Never override an active subscription with another active subscription
            if (currentUser.subscription_status === 'active' && subscriptionData.status === 'active') {
                console.log(`⏭️ Skipping subscription update - cannot override active subscription for user ${userId}`);
                return currentUser;
            }

            // Check if this update is newer than the current one
            const currentEndDate = currentUser.subscription_end_date ? new Date(currentUser.subscription_end_date) : null;
            const newEndDate = subscriptionData.endDate ? new Date(subscriptionData.endDate) : null;

            // If we have a current end date and the new one is older, skip the update
            if (currentEndDate && newEndDate && newEndDate < currentEndDate) {
                console.log(`⏭️ Skipping subscription update - new end date (${newEndDate}) is older than current (${currentEndDate})`);
                return currentUser;
            }

            // If status is the same and we have a current end date, check if it's a meaningful update
            if (currentUser.subscription_status === subscriptionData.status && currentEndDate) {
                // For active subscriptions, only update if the end date is significantly different (more than 1 day)
                if (subscriptionData.status === 'active') {
                    const dayInMs = 24 * 60 * 60 * 1000;
                    const timeDiff = Math.abs(newEndDate - currentEndDate);
                    if (timeDiff < dayInMs) {
                        console.log(`⏭️ Skipping subscription update - no significant change in end date`);
                        return currentUser;
                    }
                }
            }

            // Add a timestamp for this update to track when it was processed
            const updateTimestamp = new Date().toISOString();

            const { data, error } = await client
                .from('users')
                .update({
                    stripe_customer_id: subscriptionData.customerId,
                    subscription_status: subscriptionData.status,
                    subscription_plan: subscriptionData.plan,
                    subscription_end_date: subscriptionData.endDate,
                    updated_at: updateTimestamp
                })
                .eq('id', userId)
                .select()
                .single();

            if (error) {
                console.error('Error updating subscription:', error);
                throw error;
            }

            console.log(`✅ Subscription updated successfully: ${data.id} (${subscriptionData.status})`);
            return data;
        } catch (error) {
            console.error('❌ Failed to update subscription:', error);
            throw error;
        }
    }

    // Check if subscription update should be allowed (for webhook race condition protection)
    async shouldAllowSubscriptionUpdate(userId, newStatus, newEndDate) {
        try {
            const currentUser = await this.getUserWithSubscription(userId);
            if (!currentUser) {
                return false;
            }

            // CRITICAL: Never allow overriding an active subscription with another active subscription
            if (currentUser.subscription_status === 'active' && newStatus === 'active') {
                console.log(`⏭️ Blocking subscription update - cannot override active subscription for user ${userId}`);
                return false;
            }

            const currentEndDate = currentUser.subscription_end_date ? new Date(currentUser.subscription_end_date) : null;
            const newEndDateObj = newEndDate ? new Date(newEndDate) : null;

            // If status is changing from active to cancelled, always allow
            if (currentUser.subscription_status === 'active' && newStatus === 'cancelled') {
                return true;
            }

            // If status is changing from inactive to active, always allow
            if (currentUser.subscription_status === 'inactive' && newStatus === 'active') {
                return true;
            }

            // If end dates are provided, check if the new one is newer
            if (currentEndDate && newEndDateObj) {
                return newEndDateObj > currentEndDate;
            }

            // If no current end date but new one is provided, allow
            if (!currentEndDate && newEndDateObj) {
                return true;
            }

            // Default to allowing if status is different
            return currentUser.subscription_status !== newStatus;
        } catch (error) {
            console.error('Error checking subscription update allowance:', error);
            return false;
        }
    }

    // Get user with subscription info
    async getUserWithSubscription(userId) {
        try {
            const client = this.supabase.getClient();

            const { data, error } = await client
                .from('users')
                .select(`
          id,
          firebase_uid,
          email,
          display_name,
          stripe_customer_id,
          subscription_status,
          subscription_plan,
          subscription_end_date,
          created_at,
          updated_at
        `)
                .eq('id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return null;
                }
                throw error;
            }

            return data;
        } catch (error) {
            console.error('❌ Failed to get user with subscription:', error);
            throw error;
        }
    }

    // Delete user (for cleanup)
    async deleteUser(userId) {
        try {
            const client = this.supabase.getClient();

            const { error } = await client
                .from('users')
                .delete()
                .eq('id', userId);

            if (error) {
                console.error('Error deleting user:', error);
                throw error;
            }

            console.log('✅ User deleted successfully:', userId);
            return true;
        } catch (error) {
            console.error('❌ Failed to delete user:', error);
            throw error;
        }
    }
}

export default UserSupabase; 