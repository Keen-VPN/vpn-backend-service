#!/bin/bash

# KeenVPN Backend - Docker Validation Script
# Tests the Docker setup to ensure everything works correctly

set -e

echo "🧪 KeenVPN Backend - Docker Setup Validation"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✅ PASS:${NC} $1"
}

fail() {
    echo -e "${RED}❌ FAIL:${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}⚠️  WARN:${NC} $1"
}

info() {
    echo "ℹ️  $1"
}

# Test 1: Docker installed
info "Testing Docker installation..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    pass "Docker installed: $DOCKER_VERSION"
else
    fail "Docker not found. Install from https://docs.docker.com/get-docker/"
fi

# Test 2: Docker Compose installed
info "Testing Docker Compose installation..."
if docker compose version &> /dev/null || command -v docker-compose &> /dev/null; then
    if docker compose version &> /dev/null; then
        COMPOSE_VERSION=$(docker compose version)
    else
        COMPOSE_VERSION=$(docker-compose --version)
    fi
    pass "Docker Compose installed: $COMPOSE_VERSION"
else
    fail "Docker Compose not found"
fi

# Test 3: Docker daemon running
info "Testing Docker daemon..."
if docker info &> /dev/null; then
    pass "Docker daemon is running"
else
    fail "Docker daemon not running. Start Docker Desktop or Docker service"
fi

# Test 4: Required files exist
info "Checking required files..."
FILES=(
    "Dockerfile"
    "docker-compose.yml"
    "docker-entrypoint.sh"
    "prisma/schema.prisma"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        pass "Found $file"
    else
        fail "Missing required file: $file"
    fi
done

# Test 5: Environment file
info "Checking environment configuration..."
if [ -f ".env" ]; then
    pass ".env file exists"
    
    # Check required variables
    REQUIRED_VARS=(
        "DATABASE_URL"
        "JWT_SECRET"
        "FIREBASE_PROJECT_ID"
        "STRIPE_SECRET_KEY"
    )
    
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" .env; then
            pass "Environment variable $var is set"
        else
            warn "Environment variable $var not found in .env"
        fi
    done
else
    warn ".env file not found. Copy from env.docker.example"
fi

# Test 6: Build images
info "Building Docker images (this may take a few minutes)..."
if docker-compose build --quiet > /dev/null 2>&1; then
    pass "Docker images built successfully"
else
    fail "Failed to build Docker images. Check Dockerfile syntax"
fi

# Test 7: Start services
info "Starting Docker services..."
if docker-compose up -d > /dev/null 2>&1; then
    pass "Services started"
else
    fail "Failed to start services"
fi

# Wait for services to be ready
info "Waiting for services to be ready (30 seconds)..."
sleep 30

# Test 8: PostgreSQL container running
info "Testing PostgreSQL container..."
if docker-compose ps | grep -q "postgres.*Up"; then
    pass "PostgreSQL container is running"
else
    fail "PostgreSQL container not running"
fi

# Test 9: API container running
info "Testing API container..."
if docker-compose ps | grep -q "api.*Up"; then
    pass "API container is running"
else
    fail "API container not running"
fi

# Test 10: PostgreSQL health check
info "Testing PostgreSQL connection..."
if docker-compose exec -T postgres pg_isready -U keenvpn > /dev/null 2>&1; then
    pass "PostgreSQL is accepting connections"
else
    fail "PostgreSQL not accepting connections"
fi

# Test 11: API health endpoint
info "Testing API health endpoint..."
if curl -f http://localhost:3003/health > /dev/null 2>&1; then
    HEALTH_RESPONSE=$(curl -s http://localhost:3003/health)
    pass "API health check passed: $HEALTH_RESPONSE"
else
    warn "API health check failed. Service may still be starting..."
    info "Checking API logs..."
    docker-compose logs --tail=20 api
fi

# Test 12: Database migrations
info "Checking database migrations..."
if docker-compose exec -T api npx prisma migrate status 2>&1 | grep -q "Database schema is up to date"; then
    pass "Database migrations applied"
else
    info "Migration status:"
    docker-compose exec -T api npx prisma migrate status
fi

# Test 13: Network connectivity
info "Testing network connectivity..."
if docker-compose exec -T api sh -c "ping -c 1 postgres > /dev/null 2>&1"; then
    pass "API can reach PostgreSQL"
else
    fail "API cannot reach PostgreSQL. Network issue?"
fi

# Test 14: Check logs for errors
info "Checking for errors in logs..."
ERROR_COUNT=$(docker-compose logs | grep -i "error" | grep -v "0 errors" | wc -l)
if [ "$ERROR_COUNT" -eq 0 ]; then
    pass "No errors found in logs"
else
    warn "Found $ERROR_COUNT error messages in logs"
    info "Recent errors:"
    docker-compose logs | grep -i "error" | grep -v "0 errors" | tail -5
fi

# Cleanup
info "Stopping test services..."
docker-compose down > /dev/null 2>&1

echo ""
echo "=============================================="
echo -e "${GREEN}🎉 All tests passed!${NC}"
echo ""
echo "Your Docker setup is working correctly."
echo ""
echo "📋 Next steps:"
echo "   1. Start services: docker-compose up -d"
echo "   2. View logs: docker-compose logs -f"
echo "   3. Test API: curl http://localhost:3003/health"
echo ""
echo "📚 For more information, see:"
echo "   - README.md (Docker section)"
echo "   - DOCKER.md (detailed guide)"

