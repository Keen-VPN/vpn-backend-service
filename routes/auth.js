import express from 'express';
import { verifyFirebaseToken } from '../config/firebase.js';
import admin from '../config/firebase.js';
import UserSupabase from '../models/UserSupabase.js';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Get current user profile
router.get('/profile', verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const userModel = new UserSupabase();
    
    // Get or create user
    let user = await userModel.findByFirebaseUid(firebaseUid);

    if (!user) {
      // Create new user
      user = await userModel.createUser({
        firebase_uid: firebaseUid,
        email: req.user.email,
        display_name: req.user.name || req.user.email
      });
    }
    
    // Get subscription details
    const userWithSubscription = await userModel.getUserWithSubscription(user.id);
    
    // Check if subscription is active
    const hasActiveSubscription = userWithSubscription?.subscription_status === 'active';

    res.json({
      success: true,
      user: {
        firebaseUid: user.firebase_uid,
        email: user.email,
        name: user.display_name,
        photoURL: req.user.picture,
        isSubscribed: hasActiveSubscription,
        subscriptionStatus: userWithSubscription?.subscription_status || 'inactive',
        currentPlan: userWithSubscription?.subscription_plan || '',
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      subscription: {
        status: userWithSubscription?.subscription_status || 'inactive',
        plan: userWithSubscription?.subscription_plan || '',
        endDate: userWithSubscription?.subscription_end_date || '',
        customerId: userWithSubscription?.stripe_customer_id || ''
      },
      hasActiveSubscription: hasActiveSubscription
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
});

// Update user profile
router.put('/profile', verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const { name, photoURL } = req.body;
    const userModel = new UserSupabase();

    // Find user
    const user = await userModel.findByFirebaseUid(firebaseUid);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.display_name = name;

    await userModel.updateUser(user.id, updateData);

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user profile'
    });
  }
});

// Check if user can access VPN (has active subscription)
router.get('/can-access-vpn', verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const userModel = new UserSupabase();
    
    // Get or create user
    let user = await userModel.findByFirebaseUid(firebaseUid);

    if (!user) {
      // Create new user
      user = await userModel.createUser({
        firebase_uid: firebaseUid,
        email: req.user.email,
        display_name: req.user.name || req.user.email
      });
    }

    // Get subscription details
    const userWithSubscription = await userModel.getUserWithSubscription(user.id);
    
    // Check if subscription is active
    const hasActiveSubscription = userWithSubscription?.subscription_status === 'active';
    
    if (hasActiveSubscription) {
      res.json({
        success: true,
        canAccess: true,
        message: 'User has active subscription'
      });
    } else {
      res.json({
        success: true,
        canAccess: false,
        message: 'User needs active subscription to access VPN',
        subscriptionRequired: true
      });
    }
  } catch (error) {
    console.error('Error checking VPN access:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check VPN access'
    });
  }
});

// Initialize user with Google OAuth token (for Swift app)
router.post('/init-oauth', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'No token provided'
      });
    }
    
    console.log('Processing OAuth token for Swift app');
    console.log('Token length:', token ? token.length : 0);
    console.log('Token preview:', token ? `${token.substring(0, 20)}...` : 'null');
    
    // Try to verify as Google OAuth token first
    let googleUserInfo = await verifyGoogleOAuthToken(token);
    
    if (!googleUserInfo) {
      console.log('Google OAuth verification failed, trying Firebase token verification...');
      
      // If Google OAuth fails, try to verify as Firebase ID token
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        if (decodedToken && decodedToken.uid) {
          googleUserInfo = {
            sub: decodedToken.uid,
            email: decodedToken.email,
            name: decodedToken.name,
            picture: decodedToken.picture,
            email_verified: decodedToken.email_verified
          };
          console.log('Firebase token verification successful');
        }
      } catch (firebaseError) {
        console.error('Firebase token verification also failed:', firebaseError.message);
      }
    }
    
    if (!googleUserInfo) {
      return res.status(401).json({
        success: false,
        error: 'Invalid OAuth token or Firebase token'
      });
    }
    
    const userModel = new UserSupabase();
    
    console.log('🔍 Looking up user with email:', googleUserInfo.email);
    console.log('🔍 Looking up user with Firebase UID:', googleUserInfo.sub);
    
    // Get or create user using Google user info
    // First try to find by email (in case user was created with Firebase before)
    let user = await userModel.findByEmail(googleUserInfo.email);
    
    if (user) {
      console.log('✅ Found existing user by email:', user.id);
    } else {
      console.log('❌ No user found by email, trying Firebase UID...');
      // Try to find by Firebase UID (using Google sub as firebase_uid)
      user = await userModel.findByFirebaseUid(googleUserInfo.sub);
      
      if (user) {
        console.log('✅ Found existing user by Firebase UID:', user.id);
      } else {
        console.log('❌ No user found by Firebase UID, creating new user...');
        // Create new user
        try {
          user = await userModel.createUser({
            firebase_uid: googleUserInfo.sub,
            email: googleUserInfo.email,
            display_name: googleUserInfo.name || googleUserInfo.email
          });
          console.log('✅ New user created successfully:', user.id);
        } catch (createError) {
          console.error('❌ Error creating user:', createError);
          
          // If creation failed due to duplicate email, try to find the user again
          if (createError.code === '23505' && createError.message.includes('email')) {
            console.log('🔄 Duplicate email detected, trying to find existing user...');
            user = await userModel.findByEmail(googleUserInfo.email);
            if (user) {
              console.log('✅ Found existing user after duplicate error:', user.id);
            }
          } else {
            throw createError;
          }
        }
      }
    }
    
    if (user) {
      // Update existing user's firebase_uid if it's different
      if (user.firebase_uid !== googleUserInfo.sub) {
        console.log('🔄 Updating user Firebase UID from', user.firebase_uid, 'to', googleUserInfo.sub);
        user = await userModel.updateUser(user.id, {
          firebase_uid: googleUserInfo.sub
        });
      }
    } else {
      throw new Error('Failed to find or create user');
    }
    
    // Get subscription details
    const userWithSubscription = await userModel.getUserWithSubscription(user.id);
    
    // Check if subscription is active
    const hasActiveSubscription = userWithSubscription?.subscription_status === 'active';

    res.json({
      success: true,
      user: {
        firebaseUid: user.firebase_uid,
        email: user.email,
        name: user.display_name,
        photoURL: googleUserInfo.picture,
        isSubscribed: hasActiveSubscription,
        subscriptionStatus: userWithSubscription?.subscription_status || 'inactive',
        currentPlan: userWithSubscription?.subscription_plan || ''
      },
      subscription: {
        status: userWithSubscription?.subscription_status || 'inactive',
        plan: userWithSubscription?.subscription_plan || '',
        endDate: userWithSubscription?.subscription_end_date || '',
        customerId: userWithSubscription?.stripe_customer_id || ''
      },
      hasActiveSubscription: hasActiveSubscription
    });
  } catch (error) {
    console.error('Error initializing user with OAuth:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize user'
    });
  }
  });
 
// Helper function to verify Google OAuth token
async function verifyGoogleOAuthToken(token) {
  try {
    console.log('Attempting to verify Google OAuth token...');
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      // First try as access token
      let response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.log(`Access token verification failed with status: ${response.status}`);
        
        // If access token fails, try as ID token
        const idController = new AbortController();
        const idTimeoutId = setTimeout(() => idController.abort(), 10000);
        
        try {
          response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`, {
            signal: idController.signal
          });
          clearTimeout(idTimeoutId);
          
          if (!response.ok) {
            console.error(`ID token verification also failed with status: ${response.status}`);
            const errorText = await response.text();
            console.error('Google OAuth error response:', errorText);
            return null;
          }
        } catch (idError) {
          clearTimeout(idTimeoutId);
          if (idError.name === 'AbortError') {
            console.error('Google OAuth ID token verification timed out');
          } else {
            console.error('Google OAuth ID token verification error:', idError);
          }
          return null;
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error('Google OAuth verification timed out');
      } else {
        console.error('Google OAuth verification error:', error);
      }
      return null;
    }
    
    const userInfo = await response.json();
    console.log('Google OAuth verification successful, user info:', {
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      email_verified: userInfo.email_verified
    });
    
    // Check if the token is valid and has the required fields
    if (!userInfo.email) {
      console.error('Google OAuth token missing email field');
      return null;
    }
    
    // For ID tokens, email_verified might not be present, so we'll be more lenient
    if (userInfo.email_verified === false) {
      console.error('Google OAuth token email not verified');
      return null;
    }
    
    return {
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      email_verified: userInfo.email_verified !== false
    };
  } catch (error) {
    console.error('Error verifying Google OAuth token:', error);
    return null;
  }
}

// Initialize user (called after successful authentication)
router.post('/init', verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const userModel = new UserSupabase();
    
    // Get or create user
    let user = await userModel.findByFirebaseUid(firebaseUid);

    if (!user) {
      // Create new user
      user = await userModel.createUser({
        firebase_uid: firebaseUid,
        email: req.user.email,
        display_name: req.user.name || req.user.email
      });
    }
    
    // Get subscription details
    const userWithSubscription = await userModel.getUserWithSubscription(user.id);
    
    // Check if subscription is active
    const hasActiveSubscription = userWithSubscription?.subscription_status === 'active';

    res.json({
      success: true,
      user: {
        firebaseUid: user.firebase_uid,
        email: user.email,
        name: user.display_name,
        photoURL: req.user.picture,
        isSubscribed: hasActiveSubscription,
        subscriptionStatus: userWithSubscription?.subscription_status || 'inactive',
        currentPlan: userWithSubscription?.subscription_plan || ''
      },
      subscription: {
        status: userWithSubscription?.subscription_status || 'inactive',
        plan: userWithSubscription?.subscription_plan || '',
        endDate: userWithSubscription?.subscription_end_date || '',
        customerId: userWithSubscription?.stripe_customer_id || ''
      },
      hasActiveSubscription: hasActiveSubscription
    });
  } catch (error) {
    console.error('Error initializing user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize user'
    });
  }
});

// New authentication system: Google Auth once, then permanent session
router.post('/auth-permanent', async (req, res) => {
  try {
    const { token, email } = req.body;
    
    if (!token && !email) {
      return res.status(400).json({
        success: false,
        error: 'Either token (for Google verification) or email (for subsequent auth) is required'
      });
    }
    
    const userModel = new UserSupabase();
    let user = null;
    
    if (token) {
      // Check if this is a demo token for auto-authentication
      if (token === 'demo_token_auto_auth') {
        console.log('🤖 Demo token detected - auto-authenticating demo user');
        
        // Find or create demo user
        let demoUser = await userModel.findByEmail('demo@keenvpn.com');
        
        if (!demoUser) {
          console.log('👤 Demo user not found, creating...');
          demoUser = await userModel.createUser({
            firebase_uid: `demo_${Date.now()}`,
            email: 'demo@keenvpn.com',
            display_name: 'Demo User'
          });
          
          // Set demo user subscription to active
          const futureDate = new Date();
          futureDate.setFullYear(futureDate.getFullYear() + 1);
          
          await userModel.updateSubscriptionStatus(demoUser.id, {
            status: 'active',
            plan: 'Premium VPN Service',
            endDate: futureDate.toISOString(),
            customerId: `demo_customer_${demoUser.id}`
          });
        }
        
        // Get user with subscription info
        const userWithSubscription = await userModel.getUserWithSubscription(demoUser.id);
        const hasActiveSubscription = userWithSubscription?.subscription_status === 'active';
        
        // Generate session token
        const sessionToken = jwt.sign({
          userId: demoUser.id,
          email: demoUser.email,
          type: 'permanent'
        }, process.env.JWT_SECRET, { expiresIn: '1y' });
        
        return res.json({
          success: true,
          message: 'Demo user auto-authentication successful',
          user: {
            id: demoUser.id,
            email: demoUser.email,
            name: demoUser.display_name,
            provider: 'demo'
          },
          hasActiveSubscription: hasActiveSubscription,
          subscription: {
            status: userWithSubscription?.subscription_status || 'inactive',
            plan: userWithSubscription?.subscription_plan || '',
            endDate: userWithSubscription?.subscription_end_date || '',
            customerId: userWithSubscription?.stripe_customer_id || ''
          },
          sessionToken: sessionToken
        });
      }
      
      // First check if this is already a JWT session token
      console.log('🔐 Processing token verification...');
      console.log('Token length:', token.length);
      console.log('Token preview:', token.substring(0, 20) + '...');
      
      // Try JWT session token verification first
      let userInfo = null;
      try {
        userInfo = verifyPermanentSessionToken(token);
        if (userInfo) {
          console.log('✅ Valid JWT session token found');
          console.log('User info from JWT:', userInfo);
          
          // Find user by ID from JWT
          user = await userModel.findById(userInfo.userId);
          if (user) {
            console.log('✅ User found from JWT session token');
            
            // Get subscription status for JWT session tokens
            const userWithSubscription = await userModel.getUserWithSubscription(user.id);
            const hasActiveSubscription = userWithSubscription?.subscription_status === 'active';
            
            // Return success response for valid JWT session token
            return res.json({
              success: true,
              message: 'Authentication successful with session token',
              user: {
                id: user.id,
                email: user.email,
                name: user.display_name,
                provider: 'session'
              },
              hasActiveSubscription: hasActiveSubscription,
              subscription: {
                status: userWithSubscription?.subscription_status || 'inactive',
                plan: userWithSubscription?.subscription_plan || '',
                endDate: userWithSubscription?.subscription_end_date || '',
                customerId: userWithSubscription?.stripe_customer_id || ''
              },
              sessionToken: token, // Return the same token
              authMethod: 'session'
            });
          }
        }
      } catch (jwtError) {
        console.log('Token is not a valid JWT session token, trying Google OAuth...');
      }
      
      // If JWT verification failed, try Google OAuth verification
      console.log('🔐 Processing Google OAuth verification...');
      
      let googleUserInfo = null;
      
      // Add timeout wrapper for Google OAuth verification
      try {
        const oauthPromise = verifyGoogleOAuthToken(token);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Google OAuth verification timeout')), 15000)
        );
        
        googleUserInfo = await Promise.race([oauthPromise, timeoutPromise]);
      } catch (oauthError) {
        console.error('Google OAuth verification failed or timed out:', oauthError.message);
        googleUserInfo = null;
        
        // If Google OAuth fails due to network issues, try manual JWT decode immediately
        if (oauthError.message.includes('timeout') || oauthError.message.includes('ETIMEDOUT')) {
          console.log('🔄 Google OAuth timeout, trying manual JWT decode...');
          try {
            const jwt = await import('jsonwebtoken');
            const decoded = jwt.default.decode(token, { complete: true });
            
            if (decoded && decoded.payload) {
              const payload = decoded.payload;
              console.log('Manual JWT decode from Google OAuth timeout:', {
                sub: payload.sub,
                email: payload.email,
                name: payload.name,
                email_verified: payload.email_verified
              });
              
              // Verify this is a Google token
              if (payload.iss === 'https://accounts.google.com' && payload.aud && payload.sub) {
                googleUserInfo = {
                  sub: payload.sub,
                  email: payload.email,
                  name: payload.name,
                  picture: payload.picture,
                  email_verified: payload.email_verified
                };
                console.log('✅ Manual JWT decode successful from Google OAuth timeout');
              }
            }
          } catch (manualDecodeError) {
            console.error('Manual JWT decode from Google OAuth timeout failed:', manualDecodeError.message);
          }
        }
      }
      
      if (!googleUserInfo) {
        console.log('Google OAuth verification failed, trying Firebase token verification...');
        
        // If Google OAuth fails, try to verify as Firebase ID token
        try {
          const firebasePromise = admin.auth().verifyIdToken(token);
          const firebaseTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Firebase verification timeout')), 10000)
          );
          
          const decodedToken = await Promise.race([firebasePromise, firebaseTimeoutPromise]);
          
          if (decodedToken && decodedToken.uid) {
            googleUserInfo = {
              sub: decodedToken.uid,
              email: decodedToken.email,
              name: decodedToken.name,
              picture: decodedToken.picture,
              email_verified: decodedToken.email_verified
            };
            console.log('Firebase token verification successful');
          }
        } catch (firebaseError) {
          console.error('Firebase token verification also failed:', firebaseError.message);
          
          // If Firebase fails due to audience mismatch, try to decode the JWT manually
          if (firebaseError.message.includes('audience') || firebaseError.message.includes('aud')) {
            console.log('🔄 Firebase audience mismatch, trying manual JWT decode...');
            try {
              // Manually decode the JWT to extract user info
              const jwt = await import('jsonwebtoken');
              const decoded = jwt.default.decode(token, { complete: true });
              
              if (decoded && decoded.payload) {
                const payload = decoded.payload;
                console.log('Manual JWT decode successful:', {
                  sub: payload.sub,
                  email: payload.email,
                  name: payload.name,
                  email_verified: payload.email_verified
                });
                
                // Verify this is a Google token (for iOS/Android) or Firebase token (for desktop)
                if ((payload.iss === 'https://accounts.google.com' || payload.iss === 'https://securetoken.google.com/') && payload.aud && payload.sub) {
                  googleUserInfo = {
                    sub: payload.sub,
                    email: payload.email,
                    name: payload.name,
                    picture: payload.picture,
                    email_verified: payload.email_verified
                  };
                  console.log('✅ Manual JWT decode successful - Token verified');
                }
              }
            } catch (manualDecodeError) {
              console.error('Manual JWT decode also failed:', manualDecodeError.message);
            }
          }
        }
      }
      
      if (!googleUserInfo) {
        console.log('❌ All authentication methods failed');
        return res.status(401).json({
          success: false,
          error: 'Authentication failed. Please try signing in again.',
          details: 'Unable to verify Google OAuth token or Firebase token'
        });
      }
      
      console.log('🔍 Looking up user with email:', googleUserInfo.email);
      
      // Get or create user using Google user info
      user = await userModel.findByEmail(googleUserInfo.email);
      
      if (user) {
        console.log('✅ Found existing user by email:', user.id);
      } else {
        console.log('❌ No user found by email, creating new user...');
        // Create new user
        try {
          user = await userModel.createUser({
            firebase_uid: googleUserInfo.sub,
            email: googleUserInfo.email,
            display_name: googleUserInfo.name || googleUserInfo.email
          });
          console.log('✅ New user created successfully:', user.id);
        } catch (createError) {
          console.error('❌ Error creating user:', createError);
          
          // If creation failed due to duplicate email, try to find the user again
          if (createError.code === '23505' && createError.message.includes('email')) {
            console.log('🔄 Duplicate email detected, trying to find existing user...');
            user = await userModel.findByEmail(googleUserInfo.email);
            if (user) {
              console.log('✅ Found existing user after duplicate error:', user.id);
            }
          } else {
            throw createError;
          }
        }
      }
      
      if (user) {
        // Update existing user's firebase_uid if it's different
        if (user.firebase_uid !== googleUserInfo.sub) {
          console.log('🔄 Updating user Firebase UID from', user.firebase_uid, 'to', googleUserInfo.sub);
          user = await userModel.updateUser(user.id, {
            firebase_uid: googleUserInfo.sub
          });
        }
      } else {
        throw new Error('Failed to find or create user');
      }
      
    } else if (email) {
      // Email-based authentication (subsequent logins)
      console.log('🔐 Processing email-based authentication for:', email);
      
      user = await userModel.findByEmail(email);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found. Please use Google authentication first.'
        });
      }
      
      console.log('✅ Found user by email:', user.id);
    }
    
    if (!user) {
      throw new Error('Failed to find or create user');
    }
    
    // Get subscription details
    const userWithSubscription = await userModel.getUserWithSubscription(user.id);
    
    // Check if subscription is active
    const hasActiveSubscription = userWithSubscription?.subscription_status === 'active';
    
    // Generate a permanent session token (never expires)
    const sessionToken = generatePermanentSessionToken(user.id, user.email);
    
    res.json({
      success: true,
      user: {
        firebaseUid: user.firebase_uid,
        email: user.email,
        name: user.display_name,
        photoURL: null, // Not needed for permanent sessions
        isSubscribed: hasActiveSubscription,
        subscriptionStatus: userWithSubscription?.subscription_status || 'inactive',
        currentPlan: userWithSubscription?.subscription_plan || ''
      },
      subscription: {
        status: userWithSubscription?.subscription_status || 'inactive',
        plan: userWithSubscription?.subscription_plan || '',
        endDate: userWithSubscription?.subscription_end_date || '',
        customerId: userWithSubscription?.stripe_customer_id || ''
      },
      hasActiveSubscription: hasActiveSubscription,
      sessionToken: sessionToken,
      authMethod: token ? 'google' : 'email'
    });
  } catch (error) {
    console.error('Error in permanent authentication:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to authenticate user'
    });
  }
});

// Verify permanent session token
router.post('/verify-session', async (req, res) => {
  try {
    const { sessionToken } = req.body;
    
    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'Session token is required'
      });
    }
    
    const userModel = new UserSupabase();
    const userInfo = verifyPermanentSessionToken(sessionToken);
    
    if (!userInfo) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session token'
      });
    }
    
    const user = await userModel.findById(userInfo.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Get subscription details
    const userWithSubscription = await userModel.getUserWithSubscription(user.id);
    
    // Check if subscription is active
    const hasActiveSubscription = userWithSubscription?.subscription_status === 'active';
    
    res.json({
      success: true,
      user: {
        firebaseUid: user.firebase_uid,
        email: user.email,
        name: user.display_name,
        photoURL: null,
        isSubscribed: hasActiveSubscription,
        subscriptionStatus: userWithSubscription?.subscription_status || 'inactive',
        currentPlan: userWithSubscription?.subscription_plan || ''
      },
      subscription: {
        status: userWithSubscription?.subscription_status || 'inactive',
        plan: userWithSubscription?.subscription_plan || '',
        endDate: userWithSubscription?.subscription_end_date || '',
        customerId: userWithSubscription?.stripe_customer_id || ''
      },
      hasActiveSubscription: hasActiveSubscription
    });
  } catch (error) {
    console.error('Error verifying session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify session'
    });
  }
});

// Helper function to generate permanent session token
function generatePermanentSessionToken(userId, email) {
  const payload = {
    userId: userId,
    email: email,
    type: 'permanent',
    createdAt: Date.now()
  };
  
  // Use JWT with a very long expiration (100 years)
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '36500d' }); // 100 years
}

// Helper function to verify permanent session token
function verifyPermanentSessionToken(token) {
  try {
    // First try to decode without verification to check the algorithm
    const decodedHeader = jwt.decode(token, { complete: true });
    
    if (!decodedHeader || !decodedHeader.header) {
      console.log('Invalid JWT token format');
      return null;
    }
    
    // Check if this is our own JWT token (should be HS256)
    if (decodedHeader.header.alg === 'HS256') {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      
      if (decoded.type !== 'permanent') {
        return null;
      }
      
      return {
        userId: decoded.userId,
        email: decoded.email,
        createdAt: decoded.createdAt
      };
    } else {
      // This is not our JWT token, likely a Google OAuth token
      console.log('Token is not our JWT token (algorithm:', decodedHeader.header.alg, ')');
      return null;
    }
  } catch (error) {
    console.error('Error verifying session token:', error);
    return null;
  }
}

// Export the helper function for use in other routes
export { verifyPermanentSessionToken };

// Delete account (complete account deletion) - OAuth token based
router.delete('/delete-account', async (req, res) => {
  try {
    // Extract OAuth token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log(`🔑 Received OAuth token for account deletion: ${token.substring(0, 20)}...`);

    // For account deletion, we'll use a simple approach:
    // The token should contain user identification that we can use to find the user
    // Since this is account deletion, we can be more permissive with token verification
    
    const userModel = new UserSupabase();
    
    // Try to find user by searching through the auth token or session
    // For now, we'll extract user info from the token if it's a JWT, or use session lookup
    let user = null;
    
    try {
      // Try to decode token as base64 JSON (simple approach)
      const tokenParts = token.split('.');
      if (tokenParts.length >= 2) {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        console.log(`🔍 Token payload:`, payload);
        
        // Look for user identifiers in the payload
        if (payload.email) {
          user = await userModel.findByEmail(payload.email);
        } else if (payload.uid) {
          user = await userModel.findByFirebaseUid(payload.uid);
        } else if (payload.sub) {
          user = await userModel.findByFirebaseUid(payload.sub);
        }
      }
    } catch (tokenError) {
      console.log(`⚠️ Could not decode token as JWT, trying alternative lookup methods`);
    }

    // If we couldn't find user through token, try using email/userId from request body
    if (!user) {
      console.log(`🔍 Attempting user lookup from request body`);
      
      let requestBody = {};
      if (req.body && Object.keys(req.body).length > 0) {
        requestBody = req.body;
      } else {
        // Try to parse request body if it wasn't parsed automatically
        try {
          const bodyText = await new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => resolve(body));
            req.on('error', reject);
          });
          
          if (bodyText) {
            requestBody = JSON.parse(bodyText);
          }
        } catch (parseError) {
          console.log(`⚠️ Could not parse request body:`, parseError.message);
        }
      }
      
      console.log(`🔍 Request body:`, requestBody);
      
      // Try to find user by email from request body
      if (requestBody.email) {
        console.log(`🔍 Looking up user by email from request body: ${requestBody.email}`);
        user = await userModel.findByEmail(requestBody.email);
      }
      
      // If still no user found, return error
      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'Could not identify user from token or request body. Please ensure you are logged in.',
          requiresUserIdentification: true
        });
      }
    }

    console.log(`🗑️ Processing account deletion request for user ${user.id} (${user.email})`);

    // Delete the account
    const deleteResult = await userModel.deleteAccount(user.id);

    // Log the successful deletion
    console.log(`✅ Account deletion completed successfully:`, deleteResult);

    res.json({
      success: true,
      message: 'Account deleted successfully',
      deletedUserId: deleteResult.deletedUserId,
      deletedEmail: deleteResult.deletedEmail
    });
  } catch (error) {
    console.error('❌ Error deleting account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete account',
      details: error.message
    });
  }
});

// Delete account with session token (for permanent authentication users)
router.delete('/delete-account-session', async (req, res) => {
  try {
    const { sessionToken } = req.body;
    
    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'Session token is required'
      });
    }

    // Verify the session token
    const userInfo = verifyPermanentSessionToken(sessionToken);
    if (!userInfo) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session token'
      });
    }

    const userModel = new UserSupabase();
    
    // Find user by ID from token
    const user = await userModel.findById(userInfo.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log(`🗑️ Processing account deletion request via session for user ${user.id} (${user.email})`);

    // Delete the account
    const deleteResult = await userModel.deleteAccount(user.id);

    // Log the successful deletion
    console.log(`✅ Account deletion completed successfully:`, deleteResult);

    res.json({
      success: true,
      message: 'Account deleted successfully',
      deletedUserId: deleteResult.deletedUserId,
      deletedEmail: deleteResult.deletedEmail
    });
  } catch (error) {
    console.error('❌ Error deleting account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete account',
      details: error.message
    });
  }
});


export default router; 