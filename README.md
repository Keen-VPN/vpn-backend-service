# KeenVPN Backend API

A Node.js backend API for KeenVPN built with Express.js, Supabase (PostgreSQL), Firebase Authentication, and Stripe for subscription management. Deployed on Netlify Functions.

## 🚀 Features

- **Authentication**: Firebase Authentication integration
- **Database**: Supabase (PostgreSQL) for user management and subscriptions
- **Payments**: Stripe integration for subscription management
- **Serverless**: Deployed on Netlify Functions
- **Security**: Rate limiting, CORS, and input validation

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Firebase Admin SDK
- **Payments**: Stripe
- **Deployment**: Netlify Functions
- **Security**: Helmet, CORS, Rate Limiting

## 📋 Prerequisites

- Node.js (v18 or higher)
- Supabase account and project
- Firebase project
- Stripe account
- Netlify account

## 🔧 Environment Variables

Create a `.env` file with the following variables:

```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Firebase Private Key\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-firebase-client-email@your-project.iam.gserviceaccount.com

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PRICE_ID=price_your_stripe_price_id

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Server Configuration
NODE_ENV=development
PORT=3000
```

## 🗄️ Database Setup

1. **Create Supabase Project**: Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. **Run SQL Schema**: Execute the schema from `supabase-schema.sql` in your Supabase SQL Editor
3. **Get Credentials**: Copy your project URL and API keys from Settings → API

## 🚀 Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp env.example .env
   # Edit .env with your actual values
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

## 📡 API Endpoints

### Health Check
- `GET /health` - Check API and database health

### Authentication
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `GET /api/auth/can-access-vpn` - Check VPN access
- `POST /api/auth/init` - Initialize user

### Subscriptions
- `GET /api/subscription/plans` - Get available plans
- `GET /api/subscription/status` - Get subscription status
- `POST /api/subscription/customer-portal` - Create customer portal session
- `POST /api/subscription/create-checkout-session` - Create Stripe checkout

### Webhooks
- `POST /api/subscription/webhook` - Stripe webhook handler

## 🧪 Testing

Test the Supabase connection:
```bash
node test-supabase.js
```

Test API endpoints:
```bash
# Health check
curl http://localhost:3001/health

# Get plans
curl http://localhost:3001/api/subscription/plans
```

## 🚀 Deployment

### Netlify Functions

1. **Connect to Netlify**: Link your repository to Netlify
2. **Set Environment Variables**: Add all environment variables in Netlify dashboard
3. **Deploy**: Push to main branch to trigger deployment

### Environment Variables for Production

Make sure to set these in your Netlify dashboard:
- All Firebase credentials
- All Stripe credentials  
- All Supabase credentials
- `NODE_ENV=production`

## 📊 Monitoring

- **Health Checks**: Monitor `/health` endpoint
- **Supabase Dashboard**: Monitor database performance
- **Netlify Analytics**: Monitor function performance

## 🔒 Security

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS**: Configured for specific origins
- **Input Validation**: Express-validator for request validation
- **Authentication**: Firebase token verification on protected routes

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License. 