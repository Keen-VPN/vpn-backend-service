# KeenVPN Backend - Netlify Deployment Guide

This guide will help you deploy the KeenVPN backend API to Netlify Functions.

## Prerequisites

1. A Netlify account
2. MongoDB Atlas account (for production database)
3. Firebase project setup
4. Stripe account with API keys

## Setup Steps

### 1. Environment Variables

Set up the following environment variables in your Netlify dashboard:

**Go to Site Settings > Environment Variables**

```
# Server Configuration
NODE_ENV=production
PORT=8888

# MongoDB Configuration
MONGODB_URI_PROD=mongodb+srv://username:password@cluster.mongodb.net/keenvpn

# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_CHECKOUT_LINK=https://buy.stripe.com/your_checkout_link

# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Private Key Here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project.iam.gserviceaccount.com

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key

# Subscription Plan Configuration
PLAN_PRICE=99.99
PLAN_NAME=Premium VPN
PLAN_FEATURES=Unlimited bandwidth,Global servers,Premium support
```

### 2. Deploy to Netlify

#### Option A: Deploy via Git (Recommended)

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)
2. Connect your repository to Netlify
3. Set build settings:
   - **Build command**: `npm install`
   - **Publish directory**: `public`
   - **Functions directory**: `functions`

#### Option B: Deploy via Netlify CLI

1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Login to Netlify:
   ```bash
   netlify login
   ```

3. Initialize and deploy:
   ```bash
   cd backend
   netlify init
   netlify deploy --prod
   ```

### 3. Update CORS Settings

After deployment, update the CORS origins in `functions/api.js`:

```javascript
app.use(cors({
  origin: [
    'https://your-frontend-domain.com',
    'https://your-app.netlify.app',
    'http://localhost:5173', // for development
    'http://localhost:3000'  // for development
  ],
  credentials: true
}));
```

### 4. Test Your Deployment

Your API will be available at:
- **Health Check**: `https://your-site.netlify.app/.netlify/functions/api/health`
- **Auth API**: `https://your-site.netlify.app/.netlify/functions/api/auth`
- **Subscription API**: `https://your-site.netlify.app/.netlify/functions/api/subscription`

### 5. Update Frontend Configuration

Update your frontend application to use the new Netlify API URL:

```javascript
// In your frontend API configuration
const API_BASE_URL = 'https://your-site.netlify.app/.netlify/functions/api';
```

## API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/verify` - Verify JWT token
- `POST /auth/refresh` - Refresh JWT token

### Subscriptions
- `POST /subscription/create-checkout-session` - Create Stripe checkout session
- `POST /subscription/webhook` - Stripe webhook handler
- `GET /subscription/status` - Get subscription status
- `POST /subscription/cancel` - Cancel subscription

### Utility
- `GET /health` - Health check endpoint
- `GET /success` - Payment success page
- `GET /cancel` - Payment cancel page

## Troubleshooting

### Common Issues

1. **Function timeout**: Netlify Functions have a 10-second timeout by default. For longer operations, consider using background jobs.

2. **Database connections**: The function creates a new database connection for each request. This is handled automatically.

3. **CORS errors**: Make sure your frontend domain is included in the CORS origins.

4. **Environment variables**: Double-check that all environment variables are set correctly in Netlify.

### Monitoring

- Use Netlify's function logs to debug issues
- Monitor function execution times and memory usage
- Set up alerts for function failures

## Security Considerations

1. **Environment Variables**: Never commit sensitive data to your repository
2. **CORS**: Restrict CORS origins to only your frontend domains
3. **Rate Limiting**: The API includes rate limiting to prevent abuse
4. **Input Validation**: All endpoints include input validation
5. **HTTPS**: Netlify automatically provides HTTPS

## Performance Optimization

1. **Database Connection Pooling**: MongoDB Atlas handles connection pooling
2. **Caching**: Consider implementing Redis for session caching
3. **CDN**: Netlify provides global CDN for static assets
4. **Function Optimization**: Keep functions lightweight and efficient

## Support

For issues specific to Netlify Functions, refer to the [Netlify Functions documentation](https://docs.netlify.com/functions/overview/). 