#!/bin/bash

# KeenVPN Backend - Tunnelto.dev Setup Script
# This script sets up tunnelto.dev for local development tunneling

set -e

echo "🔧 Setting up tunnelto.dev for KeenVPN Backend..."

# Check if tunnelto is already installed
if command -v tunnelto &> /dev/null; then
    echo "✅ tunnelto is already installed"
    tunnelto --version
else
    echo "📥 Installing tunnelto..."
    
    # Install tunnelto
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            echo "🍺 Installing via Homebrew..."
            brew install tunnelto-dev/tunnelto/tunnelto
        else
            echo "📦 Installing via curl..."
            curl -sL https://tunnelto.dev/install.sh | sh
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        echo "📦 Installing via curl..."
        curl -sL https://tunnelto.dev/install.sh | sh
    else
        echo "❌ Unsupported operating system: $OSTYPE"
        echo "Please install tunnelto manually from https://tunnelto.dev/"
        exit 1
    fi
    
    echo "✅ tunnelto installed successfully"
fi

# Check if .env exists and has TUNNELTO_SUBDOMAIN
if [[ -f .env ]]; then
    if grep -q "TUNNELTO_SUBDOMAIN" .env; then
        echo "✅ Tunnel configuration found in .env"
    else
        echo "📝 Adding tunnel configuration to .env..."
        echo "" >> .env
        echo "# Tunnelto.dev Configuration" >> .env
        echo "TUNNELTO_SUBDOMAIN=keenvpn-dev-$(whoami)" >> .env
        echo "TUNNELTO_PORT=3001" >> .env
        echo "TUNNELTO_ENABLED=true" >> .env
    fi
else
    echo "❌ .env file not found. Please copy env.example to .env first:"
    echo "   cp env.example .env"
    exit 1
fi

echo ""
echo "🎉 Tunnelto setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Run 'npm run dev:tunnel' to start server with tunnel"
echo "   2. Your API will be accessible at: https://$(grep TUNNELTO_SUBDOMAIN .env | cut -d'=' -f2).tunn.dev"
echo ""
echo "🔧 Configuration:"
echo "   • Edit TUNNELTO_SUBDOMAIN in .env to customize your subdomain"
echo "   • Set TUNNELTO_ENABLED=false to disable tunneling"
echo ""
