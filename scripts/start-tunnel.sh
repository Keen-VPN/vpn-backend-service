#!/bin/bash

# KeenVPN Backend - Manual Tunnel Start Script
# Starts a tunnelto.dev tunnel for external access to local Docker API

set -e

echo "🌐 Starting tunnelto.dev tunnel..."
echo ""

# Check if tunnelto is installed
if ! command -v tunnelto &> /dev/null; then
    echo "❌ tunnelto not found. Install it first:"
    echo "   npm run setup:tunnel"
    echo ""
    echo "   Or install manually:"
    echo "   curl -sL https://tunnelto.dev/install.sh | sh"
    exit 1
fi

# Load environment variables if .env exists
if [[ -f .env ]]; then
    # Load PORT and TUNNELTO_SUBDOMAIN from .env
    export $(grep -E '^(PORT|TUNNELTO_SUBDOMAIN|TUNNELTO_PORT)=' .env | xargs)
fi

# Set default values
PORT=${TUNNELTO_PORT:-${PORT:-3003}}
SUBDOMAIN=${TUNNELTO_SUBDOMAIN:-}

# Build tunnelto command
TUNNEL_CMD="tunnelto --port $PORT --host 127.0.0.1"

if [[ -n "$SUBDOMAIN" ]]; then
    TUNNEL_CMD="$TUNNEL_CMD --subdomain $SUBDOMAIN"
    echo "🎯 Starting tunnel with custom subdomain: $SUBDOMAIN"
    echo "🔗 Tunnel URL: https://$SUBDOMAIN.tunn.dev"
else
    echo "🎯 Starting tunnel with random subdomain"
    echo "🔗 Tunnel URL will be displayed after connection"
fi

echo "📍 Local target: http://127.0.0.1:$PORT"
echo ""
echo "💡 Use this tunnel for:"
echo "   • Webhook testing (Stripe, etc.)"
echo "   • External API access to your Docker API"
echo "   • Mobile app testing with real URLs"
echo ""
echo "⏹️  Press Ctrl+C to stop the tunnel"
echo ""

# Start the tunnel
exec $TUNNEL_CMD
