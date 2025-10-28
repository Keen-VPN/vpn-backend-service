#!/bin/bash

# KeenVPN Backend - Tunnel Testing Script
# This script tests the tunnelto.dev integration

set -e

echo "🧪 Testing KeenVPN Backend Tunnelto.dev Integration..."
echo ""

# Check if .env exists
if [[ ! -f .env ]]; then
    echo "❌ .env file not found. Creating from env.example..."
    cp env.example .env
    echo "✅ Created .env file from template"
    echo "📝 Please edit .env with your configuration before testing"
    exit 1
fi

# Check if tunnelto is installed
if ! command -v tunnelto &> /dev/null; then
    echo "❌ tunnelto not found. Running setup..."
    ./scripts/setup-tunnel.sh
fi

echo "✅ tunnelto is installed"
echo ""

# Show current configuration
echo "📋 Current tunnel configuration:"
if grep -q "TUNNELTO_ENABLED" .env; then
    echo "   TUNNELTO_ENABLED: $(grep TUNNELTO_ENABLED .env | cut -d'=' -f2)"
    echo "   TUNNELTO_SUBDOMAIN: $(grep TUNNELTO_SUBDOMAIN .env | cut -d'=' -f2)"
    echo "   TUNNELTO_PORT: $(grep TUNNELTO_PORT .env | cut -d'=' -f2)"
else
    echo "   ❌ Tunnel configuration not found in .env"
    echo "   Run: npm run setup:tunnel"
    exit 1
fi

echo ""
echo "🚀 Ready to test! Try these commands:"
echo ""
echo "1. Start server with tunnel:"
echo "   npm run dev:tunnel"
echo ""
echo "2. Start server without tunnel:"
echo "   npm run dev:no-tunnel"
echo ""
echo "3. Test health endpoint:"
echo "   curl http://localhost:3001/health"
echo ""
echo "4. Test tunnel health endpoint (when tunnel is active):"
echo "   curl https://$(grep TUNNELTO_SUBDOMAIN .env | cut -d'=' -f2).tunn.dev/health"
echo ""
echo "✨ Integration test complete!"
