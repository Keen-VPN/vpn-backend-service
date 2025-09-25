-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    firebase_uid TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    stripe_customer_id TEXT,
    subscription_status TEXT DEFAULT 'inactive',
    subscription_plan TEXT,
    subscription_end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON public.users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON public.users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON public.users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_subscription_end_date ON public.users(subscription_end_date);
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON public.users(updated_at);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your security needs)
-- For now, allow all operations (you can restrict this later)
CREATE POLICY "Allow all operations" ON public.users
    FOR ALL USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON public.users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create connection_sessions table for tracking VPN connection durations
CREATE TABLE IF NOT EXISTS public.connection_sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_start TIMESTAMP WITH TIME ZONE NOT NULL,
    session_end TIMESTAMP WITH TIME ZONE NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    server_location TEXT NULL,
    server_address TEXT NULL,
    ip_address TEXT NULL,
    platform TEXT NOT NULL,
    app_version TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
    CONSTRAINT connection_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT connection_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_connection_sessions_user_id ON public.connection_sessions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_connection_sessions_session_start ON public.connection_sessions USING btree (session_start);
CREATE INDEX IF NOT EXISTS idx_connection_sessions_session_end ON public.connection_sessions USING btree (session_end);
CREATE INDEX IF NOT EXISTS idx_connection_sessions_duration ON public.connection_sessions USING btree (duration_seconds);
CREATE INDEX IF NOT EXISTS idx_connection_sessions_platform ON public.connection_sessions USING btree (platform);
CREATE INDEX IF NOT EXISTS idx_connection_sessions_created_at ON public.connection_sessions USING btree (created_at);

-- Enable Row Level Security for connection_sessions
ALTER TABLE public.connection_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy for connection_sessions (allow all operations for now)
CREATE POLICY "Allow all operations on connection_sessions" ON public.connection_sessions
    FOR ALL USING (true);

-- Create trigger to automatically update updated_at for connection_sessions
CREATE TRIGGER update_connection_sessions_updated_at 
    BEFORE UPDATE ON public.connection_sessions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample data (optional)
-- INSERT INTO public.users (firebase_uid, email, display_name, subscription_status) 
-- VALUES 
--     ('sample_firebase_uid_1', 'user1@example.com', 'Test User 1', 'inactive'),
--     ('sample_firebase_uid_2', 'user2@example.com', 'Test User 2', 'active'); 