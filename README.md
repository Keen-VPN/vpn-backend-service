# KeenVPN Backend - TypeScript + Prisma

Modern, type-safe backend API for KeenVPN with TypeScript, Prisma ORM, and PostgreSQL.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Database

**Option A: Use Neon (Recommended)**

- Sign up at https://neon.tech
- Create project "KeenVPN"
- Copy connection string
- Add to `.env`: `DATABASE_URL="postgresql://..."`
- See: `NEON_SETUP_GUIDE.md`

**Option B: Use Supabase**

- Run migration scripts in `migration-scripts/` via Supabase SQL Editor
- See: `migration-scripts/00-RUN-THIS-FIRST.md`

### 3. Update Prisma Schema

Edit `prisma/schema.prisma` - remove `directUrl` if using Neon:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 4. Push Schema & Start

```bash
npm run prisma:push
npm run dev
```

---

## 📁 Project Structure

```
backend/
├── src/                    # TypeScript source
│   ├── config/            # Configuration
│   ├── models/            # Database models (Prisma)
│   ├── routes/            # API routes
│   ├── types/             # TypeScript types
│   └── utils/             # Utilities
├── prisma/
│   └── schema.prisma      # Database schema
├── migration-scripts/     # SQL migrations for Supabase
├── dist/                  # Compiled JavaScript
└── package.json
```

---

## 🛠️ Development Commands

```bash
npm run dev              # Start dev server (hot reload)
npm run dev:tunnel       # Start with tunnelto.dev tunnel enabled
npm run dev:no-tunnel    # Start without tunnel (local only)
npm run setup:tunnel     # Install and configure tunnelto.dev
npm run build            # Compile TypeScript
npm start                # Run production build
npm run prisma:studio    # Open database GUI
npm run prisma:push      # Push schema to database
npm run type-check       # Check TypeScript types
```

---

## 🌐 Tunnelto.dev Integration

KeenVPN Backend includes integrated [tunnelto.dev](https://tunnelto.dev/) support for secure local development tunneling. This eliminates "works on my machine" issues and enables external API testing, webhook development, and team collaboration.

### 🚀 Quick Setup

1. **Install tunnelto.dev**:

   ```bash
   npm run setup:tunnel
   ```

2. **Start with tunnel**:

   ```bash
   npm run dev:tunnel
   ```

3. **Your API is now publicly accessible**:
   ```
   🌍 Public tunnel: https://keenvpn.tunn.dev
   📡 Webhook URL: https://keenvpn.tunn.dev/api/subscription/webhook
   ```

### ⚙️ Configuration

Edit `.env` to customize your tunnel:

```env
# Enable/disable tunneling (only works in development)
TUNNELTO_ENABLED=true

# Your custom subdomain (make it unique!)
TUNNELTO_SUBDOMAIN=keenvpn

# Port to tunnel (matches your server port)
TUNNELTO_PORT=3001
```

### 🎯 Use Cases

#### 1. **Stripe Webhook Testing**

```bash
# Start server with tunnel
npm run dev:tunnel

# Use tunnel URL in Stripe Dashboard
# Webhook URL: https://your-subdomain.tunn.dev/api/subscription/webhook
```

#### 2. **Mobile App Development**

```bash
# Replace localhost in your mobile app with tunnel URL
# iOS/Android: https://your-subdomain.tunn.dev/api
```

#### 3. **Team Collaboration**

```bash
# Share your tunnel URL with team members
# They can test your local API changes instantly
```

#### 4. **External API Integration**

```bash
# Third-party services can reach your local development server
# Perfect for OAuth callbacks, payment notifications, etc.
```

### 🛠️ Commands

| Command                 | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `npm run dev:tunnel`    | Start server with tunnel **enabled**              |
| `npm run dev:no-tunnel` | Start server with tunnel **disabled**             |
| `npm run setup:tunnel`  | Install and configure tunnelto.dev                |
| `npm run dev`           | Start server (uses .env TUNNELTO_ENABLED setting) |

### 🔧 Troubleshooting

#### Tunnel fails to start

```bash
# Check if tunnelto is installed
tunnelto --version

# If not installed, run setup
npm run setup:tunnel

# Try a different subdomain (might be taken)
# Edit TUNNELTO_SUBDOMAIN in .env
```

#### Subdomain already taken

```bash
# Edit .env and use a unique subdomain
TUNNELTO_SUBDOMAIN=keenvpn-dev-yourname-$(date +%s)
```

#### Want a custom subdomain?

```bash
# Get a tunnelto.dev account for reserved subdomains
# https://tunnelto.dev/ - $4/month for up to 20 custom subdomains
```

#### Tunnel URL not showing

```bash
# Check environment variables
echo $TUNNELTO_ENABLED    # Should be 'true'
echo $NODE_ENV           # Should be 'development'

# Check logs for tunnel errors
npm run dev:tunnel
```

### 🔒 Security Notes

- Tunnels only work in **development** mode (`NODE_ENV=development`)
- Tunnels are **automatically disabled** in production
- Your local database and files remain **private**
- Only HTTP requests to your server port are tunneled

### 📊 Monitoring

When tunnel is active, you'll see:

```
🌍 Public tunnel: https://your-subdomain.tunn.dev
📡 Webhook URL: https://your-subdomain.tunn.dev/api/subscription/webhook
🔧 Use this URL for external API testing and webhooks

🛠️  Development URLs:
   Local:  http://localhost:3001
   Tunnel: https://your-subdomain.tunn.dev
```

---

## 📚 API Endpoints

### Authentication

- `POST /auth/apple` - Apple Sign In
- `POST /auth/google` - Google Sign In

### Subscriptions

- `GET /subscription/plans` - Get plans ($100/year)
- `POST /subscription/status-session` - Check status
- `POST /subscription/cancel` - Cancel subscription

### Connection Tracking

- `POST /connection/session` - Record VPN session
- `GET /connection/sessions/:id` - Get user sessions
- `GET /connection/stats/:id` - Get statistics

---

## 📖 Documentation

- **QUICK_START.md** - Get running in 5 minutes
- **NEON_SETUP_GUIDE.md** - Setup Neon database
- **TYPESCRIPT_MIGRATION.md** - TypeScript guide
- **PRISMA_SETUP_GUIDE.md** - Prisma ORM guide
- **migration-scripts/** - SQL migrations for Supabase

---

## 🔧 Environment Variables

Required in `.env`:

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="your-secret"
STRIPE_SECRET_KEY="sk_..."
STRIPE_PRICE_ID="price_..."
PLAN_PRICE="100.00"
PLAN_NAME="Premium VPN - Annual"
```

See `env.example` for complete list.

---

## 🎯 Tech Stack

- **TypeScript 5.3** - Full type safety
- **Prisma 6.17** - Modern ORM
- **Express 4.18** - Web framework
- **PostgreSQL** - Database (Neon/Supabase)
- **Stripe** - Payment processing
- **JWT** - Authentication
- **Tunnelto.dev** - Secure local development tunneling

---

## 📊 Database Schema

- **users** - User accounts (Google, Apple, Firebase auth)
- **subscriptions** - Subscription management
- **connection_sessions** - VPN usage tracking

---

## 🚀 Production Ready

- ✅ Full TypeScript type safety
- ✅ Prisma ORM for clean queries
- ✅ Apple Sign In support
- ✅ Subscription management
- ✅ Connection tracking with bandwidth
- ✅ Rate limiting & security
- ✅ Comprehensive error handling
- ✅ Integrated tunnelto.dev for development
- ✅ Standardized team development workflow

---

## 📞 Support

Check documentation files for detailed guides or visit:

- Prisma Docs: https://www.prisma.io/docs
- TypeScript Docs: https://www.typescriptlang.org/docs

---

**Built for KeenVPN** 🚀
