import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import database from '../config/database.js';
import authRoutes from '../routes/auth.js';
import subscriptionRoutes from '../routes/subscription.js';

dotenv.config();

const app = express();

// Trust proxy for Netlify
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration for Netlify
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://yourdomain.com', 'https://your-app.netlify.app']
        : ['http://localhost:5173', 'http://localhost:3000', 'https://keenvpn.loca.lt'],
    credentials: true
}));

// Rate limiting with custom key generator
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    keyGenerator: (req) => {
        // Use X-Forwarded-For header or fallback to a default
        return req.headers['x-forwarded-for'] ||
            req.headers['client-ip'] ||
            req.ip ||
            req.connection.remoteAddress ||
            'unknown';
    },
    message: {
        error: 'Too many requests from this IP, please try again later.'
    },
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health';
    }
});
app.use('/', limiter);

// Webhook route needs raw body - must come BEFORE JSON parsing
app.use('/subscription/webhook', express.raw({ type: 'application/json' }));

// Body parsing middleware (for all other routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection middleware
app.use(async (req, res, next) => {
    try {
        if (!database.isConnected()) {
            await database.connect();
        }
        next();
    } catch (error) {
        console.error('Database connection error:', error);
        res.status(500).json({
            success: false,
            error: 'Database connection failed'
        });
    }
});

// API routes
app.use('/auth', authRoutes);
app.use('/subscription', subscriptionRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        platform: 'netlify-functions'
    });
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

// Export the serverless handler
export const handler = serverless(app); 