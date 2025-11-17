#!/bin/bash

# KeenVPN Backend - Docker Script
# Runs Docker Compose for development

set -e

echo "🔧 Starting KeenVPN Backend..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found"
    echo "Run './scripts/docker-setup.sh' first"
    exit 1
fi

# Start Docker containers
docker-compose up "$@"

