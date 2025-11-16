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

## 🐳 Docker Setup (Recommended)

**Docker provides a unified development environment that eliminates "works on my machine" issues and ensures parity with staging/production.**

### ✨ Quick Start with Docker

Run the entire application with a single command:

```bash
npm run docker:setup
```

This will:

- ✅ Check Docker installation
- ✅ Create `.env` from template
- ✅ Build Docker images
- ✅ Start PostgreSQL database
- ✅ Run database migrations
- ✅ Start the API server

**Your API is now running at `http://localhost:3003`**

### 📋 Prerequisites

- [Docker Desktop](https://docs.docker.com/get-docker/) (v20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0+)

### 🎯 Development Modes

#### Production Mode (Default)

```bash
# Start all services
docker-compose up

# Or run in background
docker-compose up -d
```

#### Development Mode (Hot Reload)

```bash
# Start with real-time logs (recommended for development)
npm run docker:dev

```

Development mode includes:

- 🔥 Hot reload on code changes
- 📂 Source code mounted as volumes
- 🐘 pgAdmin for database management (optional)
- 🔧 Development-optimized build

### 🛠️ Docker Commands

| Command                | Description                     |
| ---------------------- | ------------------------------- |
| `npm run docker:setup` | Initial setup and start         |
| `npm run docker:dev`   | Start with real-time logs       |
| `npm run docker:up`    | Start services in background    |
| `npm run docker:down`  | Stop all services               |
| `npm run docker:logs`  | View logs (follow mode)         |
| `npm run docker:build` | Rebuild images                  |
| `npm run docker:ps`    | List running containers         |
| `npm run docker:shell` | Access API container shell      |
| `npm run docker:db`    | Access PostgreSQL shell         |
| `npm run docker:clean` | Remove all containers & volumes |

### 📦 What's Included

```
Docker Environment:
├── API Server       → localhost:3003
├── PostgreSQL       → localhost:5432
└── pgAdmin (dev)    → localhost:5050
```

### ⚙️ Configuration

1. **Create `.env` file**:

```bash
cp env.docker.example .env
```

2. **Edit `.env` with your credentials**:

```env
# Database (auto-configured for Docker)
POSTGRES_USER=keenvpn
POSTGRES_PASSWORD=keenvpn_dev_password
POSTGRES_DB=keenvpn

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-email@project.iam.gserviceaccount.com

# Stripe
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID=price_your_price_id

# JWT
JWT_SECRET=your_jwt_secret_min_32_characters_long
```

3. **Start the application**:

```bash
docker-compose up
```

### 🔧 Common Tasks

#### View API Logs

```bash
docker-compose logs -f api
```

#### Run Database Migrations

Migrations run automatically on container start. To run manually:

```bash
docker-compose exec api npx prisma migrate deploy
```

#### Access Database

```bash
# Via psql
npm run docker:db

# Via pgAdmin (development mode only)
# Open http://localhost:5050
# Email: admin@keenvpn.local
# Password: admin
```

#### Prisma Studio (Database GUI)

```bash
# From your host machine (requires local Node.js)
npm run prisma:studio

# Or from inside the container
docker-compose exec api npx prisma studio
```

#### Reset Database

```bash
# Stop containers and remove volumes
docker-compose down -v

# Start fresh
docker-compose up -d
```

#### Shell Access

```bash
# API container
npm run docker:shell

# PostgreSQL container
docker-compose exec postgres sh
```

### 🔍 Troubleshooting

#### Port Already in Use

```bash
# Check what's using port 3003
lsof -i :3003

# Stop conflicting service or change port in .env
PORT=3002
```

#### Database Connection Failed

```bash
# Check if PostgreSQL is healthy
docker-compose ps

# View PostgreSQL logs
docker-compose logs postgres

# Verify DATABASE_URL in .env matches docker-compose.yml
DATABASE_URL=postgresql://keenvpn:keenvpn_dev_password@postgres:5432/keenvpn
```

#### Permission Denied

```bash
# Make scripts executable
chmod +x scripts/docker-*.sh docker-entrypoint.sh

# Or run with bash
bash scripts/docker-setup.sh
```

#### Container Won't Start

```bash
# View detailed logs
docker-compose logs api

# Rebuild from scratch
npm run docker:clean
npm run docker:setup
```

#### "Prisma Client Not Found"

```bash
# Regenerate Prisma Client inside container
docker-compose exec api npx prisma generate

# Or rebuild the image
docker-compose build --no-cache
```

### 🚀 Production Deployment

For production, use the standard `Dockerfile` with a proper orchestration platform:

**Docker Swarm**:

```bash
docker stack deploy -c docker-compose.yml keenvpn
```

**Kubernetes**:

```bash
# Generate Kubernetes manifests
kompose convert

# Deploy
kubectl apply -f .
```

**AWS ECS/Fargate**:

```bash
# Build and push image
docker build -t keenvpn-backend .
docker tag keenvpn-backend:latest YOUR_ECR_REPO:latest
docker push YOUR_ECR_REPO:latest
```

### 🔐 Security Notes

- **Never commit `.env`** - it contains sensitive credentials
- **Change default passwords** - especially `POSTGRES_PASSWORD` and `JWT_SECRET`
- **Use secrets management** - for production (AWS Secrets Manager, HashiCorp Vault, etc.)
- **Non-root user** - containers run as `keenvpn` user (UID 1001)
- **Health checks** - automatic container restarts on failure

### 📊 Multi-Stage Build

The production `Dockerfile` uses multi-stage builds:

1. **Dependencies Stage** - Install production dependencies
2. **Builder Stage** - Compile TypeScript
3. **Runner Stage** - Minimal production image (~150MB)

Benefits:

- ✅ Smaller image size
- ✅ Faster deployments
- ✅ Better security (no build tools in production)
- ✅ Reproducible builds

### 🌐 Docker + Tunnel (Recommended Approach)

Tunnels are **disabled** in Docker by default for better performance. When you need external access (webhooks, mobile testing), start a tunnel manually:

#### 1. Setup (one-time)

```bash
npm run setup:tunnel  # Install tunnelto on your host machine
```

#### 2. Start Docker API

```bash
npm run docker:up     # Start API in background
```

#### 3. Start Tunnel (when needed)

```bash
npm run tunnel:start  # Creates tunnel to Docker API on localhost:3003
```

**Benefits:**

- ✅ Fast Docker startup (no tunnel overhead)
- ✅ Tunnel only when needed (webhooks, external testing)
- ✅ Host-based tunnel (more reliable than container-based)
- ✅ Easy to stop/start tunnel independently

### 📈 Performance Tips

- Use **Docker volumes** for databases (persistent data)
- Enable **BuildKit** for faster builds: `DOCKER_BUILDKIT=1`
- Use **layer caching** - structure Dockerfile to maximize cache hits
- **Limit resources** if needed:

```yaml
# docker-compose.yml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 512M
```

### 🔄 CI/CD Integration

**GitHub Actions**:

```yaml
- name: Build and test
  run: |
    docker-compose build
    docker-compose up -d
    docker-compose exec -T api npm test
```

**GitLab CI**:

```yaml
services:
  - docker:dind

script:
  - docker-compose build
  - docker-compose up -d
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

### Standard Development

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

### Testing Commands

```bash
npm test                 # Run all integration tests
npm run test:integration # Run integration tests only
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report
```

### Docker Commands

```bash
npm run docker:setup     # Initial Docker setup and start
npm run docker:dev       # Start with real-time logs
npm run docker:test      # Validate Docker setup
npm run docker:up        # Start services in background
npm run docker:down      # Stop all services
npm run docker:logs      # View logs (follow mode)
npm run docker:build     # Rebuild images
npm run docker:ps        # List running containers
npm run docker:shell     # Access API container shell
npm run docker:db        # Access PostgreSQL shell
npm run docker:clean     # Complete cleanup (removes all data)
```

**📚 Docker Documentation:**

- [Docker Quick Reference](docs/DOCKER-QUICK-REFERENCE.md) - Essential commands
- [Docker Guide](DOCKER.md) - Comprehensive documentation

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
TUNNELTO_PORT=3003
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
| `npm run tunnel:start`  | Start tunnel manually (for Docker development)    |
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
TUNNELTO_SUBDOMAIN=keenvpn-yourname-$(date +%s)
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
   Local:  http://localhost:3003
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

### Remote Configuration

- `GET /config/vpn` - Fetch the active VPN configuration (supports `If-None-Match` for ETag caching)
- `GET /config/vpn?preview=true` - Preview the most recent config (requires `CONFIG_ADMIN_TOKEN`)
- `POST /config/vpn` - Upsert & optionally activate a new config (requires `CONFIG_ADMIN_TOKEN` & `CONFIG_CLIENT_TOKEN`)
- `PUT /config/vpn/:id` - Update an existing configuration's payload, etag, or activation state (requires `CONFIG_ADMIN_TOKEN`; activation changes also require `CONFIG_CLIENT_TOKEN`)
- `DELETE /config/vpn/:id` - Delete a configuration record (requires `CONFIG_ADMIN_TOKEN`)

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
STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID="price_..."
PLAN_PRICE="100.00"
PLAN_NAME="Premium VPN - Annual"
CONFIG_ADMIN_TOKEN="super-secret-admin-token"
CONFIG_CLIENT_TOKEN="super-secret-client-token"
```

See `env.example` for complete list.

---

## 🎯 Tech Stack

- **TypeScript 5.3** - Full type safety
- **Prisma 6.17** - Modern ORM
- **Express 4.18** - Web framework
- **PostgreSQL** - Database (Neon/Supabase/Docker)
- **Docker & Docker Compose** - Containerized development environment
- **Stripe** - Payment processing
- **JWT** - Authentication
- **Tunnelto.dev** - Secure local development tunneling
- **Jest & Supertest** - Integration testing framework
- **GitHub Actions** - CI/CD automation

---

## 🧪 Testing

KeenVPN Backend includes comprehensive integration testing with automated CI/CD via GitHub Actions.

### Running Tests Locally

1. **Setup test environment**:

   ```bash
   # Copy test environment template
   cp .env.test.example .env.test

   # Edit .env.test with test database credentials
   # Never use production credentials!
   ```

2. **Setup test database**:

   ```bash
   # Using Docker (recommended)
   docker-compose up -d postgres

   # Or create local database
   createdb keenvpn_test

   # Run migrations
   npx prisma migrate deploy
   ```

3. **Run tests**:

   ```bash
   # Run all integration tests
   npm test

   # Run with coverage report
   npm run test:coverage

   # Run in watch mode
   npm run test:watch
   ```

### Test Coverage

- **Auth Routes**: Apple/Google sign-in, session verification, account deletion
- **Subscription Routes**: Plans, status, cancellation, Stripe webhooks
- **Connection Routes**: Session tracking, statistics, heartbeats
- **Desktop Auth**: PKCE flow, code generation/exchange
- **Apple IAP**: Receipt verification, subscription management

### CI/CD Integration

Tests run automatically on:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

The GitHub Actions workflow:

1. Sets up PostgreSQL test database
2. Runs all integration tests
3. Generates coverage reports
4. Comments results on PRs

### Documentation

See [TESTING.md](TESTING.md) for detailed testing guide including:

- Writing new tests
- Mocking strategies
- Database management
- Troubleshooting
- Best practices

---

## 📊 Database Schema

- **users** - User accounts (Google, Apple, Firebase auth)
- **subscriptions** - Subscription management
- **connection_sessions** - VPN usage tracking
- **vpn_configs** - Remote configuration history & rollout control

---

## 🚀 Production Ready

- ✅ Full TypeScript type safety
- ✅ Prisma ORM for clean queries
- ✅ Apple Sign In support
- ✅ Subscription management
- ✅ Connection tracking with bandwidth
- ✅ Rate limiting & security
- ✅ Comprehensive error handling
- ✅ Docker containerization for consistent environments
- ✅ Integrated tunnelto.dev for development
- ✅ Standardized team development workflow
- ✅ Comprehensive integration testing with Jest
- ✅ Automated CI/CD pipeline with GitHub Actions
- ✅ >70% test coverage across all routes and models

---

## 📞 Support

Check documentation files for detailed guides or visit:

- Prisma Docs: https://www.prisma.io/docs
- TypeScript Docs: https://www.typescriptlang.org/docs

---

**Built for KeenVPN** 🚀
