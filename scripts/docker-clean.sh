#!/bin/bash

# KeenVPN Backend - Docker Cleanup Script
# Removes all Docker containers, volumes, and images

set -e

echo "🧹 KeenVPN Backend - Docker Cleanup"
echo "====================================="
echo ""
echo "⚠️  WARNING: This will remove all KeenVPN Docker resources"
echo "   - Containers"
echo "   - Volumes (database data will be lost)"
echo "   - Images"
echo "   - Networks"
echo ""
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Cancelled"
    exit 0
fi

echo ""
echo "🛑 Stopping containers..."
docker-compose down

echo "🗑️  Removing volumes..."
docker-compose down -v

echo "🗑️  Removing images..."
docker-compose down --rmi all

echo "🗑️  Removing orphaned containers..."
docker-compose down --remove-orphans

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "To start fresh, run: ./scripts/docker-setup.sh"

