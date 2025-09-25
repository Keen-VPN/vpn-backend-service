import express from 'express';
import { getInstance } from '../config/supabase.js';
import UserSupabase from '../models/UserSupabase.js';

const router = express.Router();
const supabase = getInstance();

// Record a connection session
router.post('/session', async (req, res) => {
  try {
    const { 
      firebase_uid, 
      email,
      session_start, 
      session_end, 
      duration_seconds, 
      platform, 
      app_version,
      server_location,
      server_address,
      ip_address
    } = req.body;

    // Validate required fields
    if (!session_start || !duration_seconds || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: session_start, duration_seconds, platform'
      });
    }

    // Try to find user, but don't fail if we can't
    const userSupabase = new UserSupabase();
    let user = null;
    
    // Only try user lookup if we have valid email or firebase_uid (not empty strings)
    if ((email && email.trim() !== '') || (firebase_uid && firebase_uid.trim() !== '')) {
      try {
        if (email) {
          console.log(`🔍 Looking up user by email: ${email}`);
          user = await userSupabase.findByEmail(email);
          if (user) {
            console.log(`✅ User found by email: ${user.id}`);
          }
        }
        
        if (!user && firebase_uid) {
          console.log(`🔍 Looking up user by firebase_uid: ${firebase_uid}`);
          user = await userSupabase.findByFirebaseUid(firebase_uid);
          if (user) {
            console.log(`✅ User found by firebase_uid: ${user.id}`);
          }
        }
      } catch (error) {
        console.error('❌ User lookup failed:', error.message);
        // Don't continue - we need a valid user
        return res.status(500).json({
          success: false,
          error: 'Failed to lookup user. Please try again.'
        });
      }
    } else {
      console.error('❌ No valid user identifier provided (email or firebase_uid)');
      return res.status(400).json({
        success: false,
        error: 'Valid user identifier (email or firebase_uid) is required.'
      });
    }
    
    // User ID is required - we cannot proceed without it
    if (!user) {
      console.error('❌ User lookup failed - cannot record session without user ID');
      return res.status(400).json({
        success: false,
        error: 'User not found. Please ensure you are properly authenticated.'
      });
    }

    // Insert connection session
    const client = supabase.getClient();
    const { data, error } = await client
      .from('connection_sessions')
      .insert([{
        user_id: user.id, // User ID is required
        session_start: session_start,
        session_end: session_end || null,
        duration_seconds: duration_seconds,
        platform: platform,
        app_version: app_version || null,
        server_location: server_location || null,
        server_address: server_address || null,
        ip_address: ip_address || null
        // created_at and updated_at will be set automatically by the database
      }])
      .select()
      .single();

    if (error) {
      console.error('Error recording connection session:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to record connection session'
      });
    }

    if (user) {
      console.log(`✅ Connection session recorded for user ${user.id}: ${duration_seconds}s on ${platform}`);
    } else {
      console.log(`✅ Connection session recorded without user association: ${duration_seconds}s on ${platform}`);
    }
    
    res.json({
      success: true,
      data: {
        session_id: data.id,
        duration_seconds: duration_seconds,
        platform: platform,
        user_associated: user ? true : false
      }
    });

  } catch (error) {
    console.error('Error in connection session endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get user's connection sessions (for reward system)
router.get('/sessions/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Find user by email (preferred) or Firebase UID (fallback)
    const userSupabase = new UserSupabase();
    let user = null;
    
    // Try email first (more reliable)
    if (identifier.includes('@')) {
      user = await userSupabase.findByEmail(identifier);
    }
    
    // Fallback to Firebase UID
    if (!user) {
      user = await userSupabase.findByFirebaseUid(identifier);
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get connection sessions
    const client = supabase.getClient();
    const { data, error } = await client
      .from('connection_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) {
      console.error('Error fetching connection sessions:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch connection sessions'
      });
    }

    res.json({
      success: true,
      data: data || []
    });

  } catch (error) {
    console.error('Error in get sessions endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get user's total connection time (for reward system)
router.get('/stats/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    // Find user by email (preferred) or Firebase UID (fallback)
    const userSupabase = new UserSupabase();
    let user = null;
    
    // Try email first (more reliable)
    if (identifier.includes('@')) {
      user = await userSupabase.findByEmail(identifier);
    }
    
    // Fallback to Firebase UID
    if (!user) {
      user = await userSupabase.findByFirebaseUid(identifier);
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get connection statistics
    const client = supabase.getClient();
    const { data, error } = await client
      .from('connection_sessions')
      .select('duration_seconds, platform, created_at')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching connection stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch connection statistics'
      });
    }

    // Calculate statistics
    const totalDuration = data.reduce((sum, session) => sum + session.duration_seconds, 0);
    const totalSessions = data.length;
    const averageDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
    
    // Group by platform
    const platformStats = data.reduce((acc, session) => {
      const platform = session.platform;
      if (!acc[platform]) {
        acc[platform] = { sessions: 0, duration: 0 };
      }
      acc[platform].sessions += 1;
      acc[platform].duration += session.duration_seconds;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        total_sessions: totalSessions,
        total_duration_seconds: totalDuration,
        average_duration_seconds: averageDuration,
        platform_breakdown: platformStats
      }
    });

  } catch (error) {
    console.error('Error in get stats endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
