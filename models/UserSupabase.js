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

    // Update subscription status
    async updateSubscriptionStatus(userId, subscriptionData) {
        try {
            const client = this.supabase.getClient();

            const { data, error } = await client
                .from('users')
                .update({
                    stripe_customer_id: subscriptionData.customerId,
                    subscription_status: subscriptionData.status,
                    subscription_plan: subscriptionData.plan,
                    subscription_end_date: subscriptionData.endDate,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)
                .select()
                .single();

            if (error) {
                console.error('Error updating subscription:', error);
                throw error;
            }

            console.log('✅ Subscription updated successfully:', data.id);
            return data;
        } catch (error) {
            console.error('❌ Failed to update subscription:', error);
            throw error;
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