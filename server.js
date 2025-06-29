import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { getInstance as getSupabaseInstance } from './config/supabase.js';
import authRoutes from './routes/auth.js';
import subscriptionRoutes from './routes/subscription.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for local tunnel
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [
      'https://vpnkeen.netlify.app',
      'https://vpnkeen.com',
      // Allow Electron app requests (file:// protocol)
      /^file:\/\//,
      // Allow localhost for Electron development
      /^http:\/\/localhost:\d+$/
    ]
    : [
      // Allow Electron app requests (file:// protocol)
      /^file:\/\//,
      // Allow localhost for Electron development
      /^http:\/\/localhost:\d+$/,
      // Allow all origins in development for easier testing
      true
    ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// Initialize Supabase
const supabase = getSupabaseInstance();

// Webhook route needs raw body - must come BEFORE JSON parsing
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));

// Body parsing middleware (for all other routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const startTime = Date.now();

    // Check Supabase connection
    const dbHealth = await supabase.healthCheck();

    const totalResponseTime = Date.now() - startTime;

    const healthData = {
      status: dbHealth.status === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: {
          status: dbHealth.status,
          responseTime: dbHealth.responseTime,
          error: dbHealth.error || null
        }
      },
      responseTime: totalResponseTime
    };

    const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthData);

  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Internal server error during health check'
    });
  }
});

// Stripe checkout success page
app.get('/success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Successful - KeenVPN</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          margin: 0; 
          padding: 0; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          min-height: 100vh; 
          color: white; 
        }
        .container { 
          text-align: center; 
          background: rgba(255,255,255,0.1); 
          padding: 40px; 
          border-radius: 20px; 
          backdrop-filter: blur(10px); 
          box-shadow: 0 8px 32px rgba(0,0,0,0.1); 
        }
        h1 { margin-bottom: 20px; font-size: 2.5em; }
        p { margin-bottom: 30px; font-size: 1.2em; opacity: 0.9; }
        .btn { 
          background: rgba(255,255,255,0.2); 
          color: white; 
          padding: 15px 30px; 
          border: none; 
          border-radius: 10px; 
          font-size: 1.1em; 
          cursor: pointer; 
          text-decoration: none; 
          display: inline-block; 
          transition: all 0.3s ease; 
        }
        .btn:hover { 
          background: rgba(255,255,255,0.3); 
          transform: translateY(-2px); 
        }
        .icon { font-size: 4em; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✅</div>
        <h1>Payment Successful!</h1>
        <p>Your KeenVPN subscription has been activated. You can now close this window and return to the app.</p>
        <a href="keenvpn://success" class="btn">Return to App</a>
      </div>
    </body>
    </html>
  `);
});

// Stripe checkout cancel page
app.get('/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Cancelled - KeenVPN</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
          margin: 0; 
          padding: 0; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          min-height: 100vh; 
          color: white; 
        }
        .container { 
          text-align: center; 
          background: rgba(255,255,255,0.1); 
          padding: 40px; 
          border-radius: 20px; 
          backdrop-filter: blur(10px); 
          box-shadow: 0 8px 32px rgba(0,0,0,0.1); 
        }
        h1 { margin-bottom: 20px; font-size: 2.5em; }
        p { margin-bottom: 30px; font-size: 1.2em; opacity: 0.9; }
        .btn { 
          background: rgba(255,255,255,0.2); 
          color: white; 
          padding: 15px 30px; 
          border: none; 
          border-radius: 10px; 
          font-size: 1.1em; 
          cursor: pointer; 
          text-decoration: none; 
          display: inline-block; 
          transition: all 0.3s ease; 
        }
        .btn:hover { 
          background: rgba(255,255,255,0.3); 
          transform: translateY(-2px); 
        }
        .icon { font-size: 4em; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">❌</div>
        <h1>Payment Cancelled</h1>
        <p>Your payment was cancelled. You can try again anytime from the app.</p>
        <a href="keenvpn://cancel" class="btn">Return to App</a>
      </div>
    </body>
    </html>
  `);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Start server
async function startServer() {
  try {
    // Initialize Supabase
    console.log('🔄 Initializing Supabase...');
    supabase.init();
    console.log('✅ Supabase initialized successfully');
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer(); 