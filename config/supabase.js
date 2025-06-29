import { createClient } from '@supabase/supabase-js';

class SupabaseDatabase {
    constructor() {
        this.client = null;
        this.isConnected = false;
    }

    // Initialize Supabase client
    init() {
        if (this.client) {
            return this.client;
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase environment variables: SUPABASE_URL and SUPABASE_ANON_KEY');
        }

        console.log('🔄 Initializing Supabase client...');

        this.client = createClient(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: false, // Don't persist in serverless
                detectSessionInUrl: false
            },
            db: {
                schema: 'public'
            },
            global: {
                headers: {
                    'X-Client-Info': 'keen-vpn-backend'
                }
            }
        });

        console.log('✅ Supabase client initialized');
        this.isConnected = true;
        return this.client;
    }

    // Get Supabase client instance
    getClient() {
        if (!this.client) {
            this.init();
        }
        return this.client;
    }

    // Test connection
    async testConnection() {
        try {
            const client = this.getClient();
            const { data, error } = await client.from('users').select('count').limit(1);

            if (error) {
                throw error;
            }

            console.log('✅ Supabase connection test successful');
            return true;
        } catch (error) {
            console.error('❌ Supabase connection test failed:', error);
            return false;
        }
    }

    // Health check
    async healthCheck() {
        try {
            const startTime = Date.now();
            const isHealthy = await this.testConnection();
            const responseTime = Date.now() - startTime;

            return {
                status: isHealthy ? 'healthy' : 'error',
                responseTime,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'error',
                responseTime: 0,
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }
}

// Singleton instance
let instance = null;

export const getInstance = () => {
    if (!instance) {
        instance = new SupabaseDatabase();
    }
    return instance;
};

export default SupabaseDatabase; 