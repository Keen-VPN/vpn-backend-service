#!/bin/bash

# KeenVPN Backend - Docker Setup Script
# Automates the initial Docker setup process

set -e

echo "🐳 KeenVPN Backend - Docker Setup"
echo "=================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

echo "✅ Docker is installed: $(docker --version)"

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed"
    echo "Please install Docker Compose from https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker Compose is installed"

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    
    if [ -f env.docker.example ]; then
        cp env.docker.example .env
        echo "✅ Created .env from env.docker.example"
    elif [ -f env.example ]; then
        cp env.example .env
        echo "✅ Created .env from env.example"
    else
        echo "❌ No environment template found"
        exit 1
    fi
    
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env with your actual credentials before proceeding"
    echo "   Required variables:"
    echo "   - FIREBASE_PROJECT_ID"
    echo "   - FIREBASE_PRIVATE_KEY"
    echo "   - FIREBASE_CLIENT_EMAIL"
    echo "   - STRIPE_SECRET_KEY"
    echo "   - STRIPE_WEBHOOK_SECRET"
    echo "   - STRIPE_INDIVIDUAL_ANNUAL_PRICE_ID"
    echo "   - JWT_SECRET"
    echo ""
    read -p "Press Enter after updating .env, or Ctrl+C to exit..."
else
    echo "✅ .env file already exists"
fi

# Build and start containers
echo ""
echo "🔨 Building Docker images..."
docker-compose build

echo ""
echo "🚀 Starting containers..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services are running"
else
    echo "❌ Services failed to start"
    echo "Run 'docker-compose logs' to see errors"
    exit 1
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Service URLs:"
echo "   API:      http://localhost:3003"
echo "   Health:   http://localhost:3003/health"
echo "   Database: localhost:5432"
echo ""
echo "🛠️  Useful commands:"
echo "   View logs:       docker-compose logs -f"
echo "   Stop services:   docker-compose down"
echo "   Restart:         docker-compose restart"
echo "   Shell access:    docker-compose exec api sh"
echo "   Database shell:  docker-compose exec postgres psql -U keenvpn"
echo ""
echo "📚 For more information, see README.md"

