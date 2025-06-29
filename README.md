# KeenVPN Backend API

A Node.js backend API for KeenVPN, built with Express.js and designed for deployment on Netlify Functions.

## Features

- 🔐 **Authentication**: JWT-based user authentication with Firebase integration
- 💳 **Subscription Management**: Stripe integration for payment processing
- 🗄️ **Database**: MongoDB with Mongoose ODM
- 🛡️ **Security**: Helmet.js, CORS, rate limiting, input validation
- ☁️ **Serverless**: Optimized for Netlify Functions deployment
- 📊 **Health Monitoring**: Built-in health check endpoints

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: Firebase Admin SDK + JWT
- **Payments**: Stripe API
- **Deployment**: Netlify Functions
- **Security**: Helmet.js, CORS, Rate Limiting

## Project Structure

```
backend/
├── config/
│   ├── database.js      # MongoDB connection configuration
│   ├── firebase.js      # Firebase Admin SDK setup
│   └── stripe.js        # Stripe configuration
├── functions/
│   └── api.js           # Main Netlify function
├── models/
│   └── User.js          # User model schema
├── routes/
│   ├── auth.js          # Authentication routes
│   └── subscription.js  # Subscription management routes
├── public/
│   └── index.html       # Landing page
├── netlify.toml         # Netlify configuration
├── server.js            # Local development server
└── package.json         # Dependencies and scripts
```

## Quick Start

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Test the API**:
   ```bash
   curl http://localhost:3001/health
   ```

### Netlify Deployment

1. **Follow the deployment guide**: See [NETLIFY_DEPLOYMENT.md](./NETLIFY_DEPLOYMENT.md)

2. **Test locally with Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   netlify dev
   ```

3. **Test the function**:
   ```bash
   node test-netlify-function.js
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/verify` - Verify JWT token
- `POST /api/auth/refresh` - Refresh JWT token

### Subscriptions
- `POST /api/subscription/create-checkout-session` - Create Stripe checkout
- `POST /api/subscription/webhook` - Stripe webhook handler
- `GET /api/subscription/status` - Get subscription status
- `POST /api/subscription/cancel` - Cancel subscription

### Utility
- `GET /health` - Health check
- `GET /success` - Payment success page
- `GET /cancel` - Payment cancel page

## Environment Variables

Required environment variables (see `env.example` for details):

- **MongoDB**: `MONGODB_URI`, `MONGODB_URI_PROD`
- **Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Firebase**: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, etc.
- **JWT**: `JWT_SECRET`
- **App**: `NODE_ENV`, `PORT`

## Development

### Running Tests
```bash
npm test
```

### Code Quality
```bash
npm run lint
```

### Database Operations
```bash
# Connect to MongoDB shell
mongosh "your-mongodb-uri"

# View collections
show collections

# Query users
db.users.find()
```

## Deployment

### Netlify Functions
- **Build Command**: `npm install`
- **Publish Directory**: `public`
- **Functions Directory**: `functions`

### Environment Setup
1. Set all environment variables in Netlify dashboard
2. Configure CORS origins for your frontend domains
3. Set up Stripe webhook endpoints
4. Configure Firebase service account

## Monitoring

### Health Checks
- **Endpoint**: `GET /health`
- **Response**: JSON with status, timestamp, and environment info

### Logs
- **Netlify**: Function logs available in Netlify dashboard
- **Local**: Console output during development

## Security

- **CORS**: Configured for specific origins
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: All endpoints validated
- **HTTPS**: Enforced in production
- **Helmet.js**: Security headers

## Troubleshooting

### Common Issues

1. **Database Connection**: Check MongoDB URI and network access
2. **CORS Errors**: Verify frontend domain in CORS configuration
3. **Function Timeout**: Optimize database queries and external API calls
4. **Environment Variables**: Ensure all variables are set in Netlify

### Debug Mode
```bash
NODE_ENV=development npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For deployment issues, see [NETLIFY_DEPLOYMENT.md](./NETLIFY_DEPLOYMENT.md)
For general support, create an issue in the repository 