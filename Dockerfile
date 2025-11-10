# ========================================
# Stage 1: Dependencies
# ========================================
FROM node:20-alpine AS deps


WORKDIR /app

# Install development tools
RUN apk add --no-cache \
    dumb-init \
    bash \
    curl \
    git

# Copy package files
COPY package*.json ./

# Copy prisma schema (needed for postinstall script)
COPY prisma ./prisma/

# Install all dependencies (including dev)
# This will automatically run 'prisma generate' via postinstall script
RUN npm install

# Copy source code and configuration files
COPY src ./src/
COPY tsconfig.json ./

# Set environment
ENV NODE_ENV=development \
    PORT=3003 \
    TUNNELTO_ENABLED=false

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3003/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Run development server with hot reload
CMD ["npm", "run", "dev"]

