#!/bin/sh
set -e

echo "🚀 Starting KeenVPN Backend..."

# Wait for database to be ready
echo "⏳ Waiting for PostgreSQL..."
until node -e "require('net').createConnection(5432, 'postgres').on('connect', () => process.exit(0)).on('error', () => process.exit(1))" 2>/dev/null; do
  echo "   PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "✅ PostgreSQL is up"

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "✅ Migrations complete"

# Generate Prisma Client (in case schema changed)
echo "🔄 Generating Prisma Client..."
npx prisma generate

echo "✅ Prisma Client generated"

# Start the application
echo "🌟 Starting application..."
exec node dist/server.js

