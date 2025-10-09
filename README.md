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
npm run build            # Compile TypeScript
npm start                # Run production build
npm run prisma:studio    # Open database GUI
npm run prisma:push      # Push schema to database
npm run type-check       # Check TypeScript types
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

---

## 📞 Support

Check documentation files for detailed guides or visit:
- Prisma Docs: https://www.prisma.io/docs
- TypeScript Docs: https://www.typescriptlang.org/docs

---

**Built for KeenVPN** 🚀
