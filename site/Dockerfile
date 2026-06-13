# ==============================================================
# ResLit — Production Dockerfile for Railway Deployment
# Multi-stage build with pnpm + Next.js standalone output
# ==============================================================

# --------------------------------------------------------------
# Stage 1 — Install dependencies
# --------------------------------------------------------------
FROM node:20-alpine AS installer
WORKDIR /app

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package manifests for layer caching
COPY pnpm-lock.yaml package.json .npmrc ./

# Install ALL dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile

# --------------------------------------------------------------
# Stage 2 — Build the Next.js app
# --------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Copy installed node_modules from installer
COPY --from=installer /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build the Next.js app (output: standalone produces .next/standalone/)
ENV NODE_ENV=production
RUN pnpm build

# --------------------------------------------------------------
# Stage 3 — Production runner (minimal image)
# --------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (includes server.js and minimal node_modules)
COPY --from=builder /app/.next/standalone ./

# Copy static assets (Next.js generates these during build)
COPY --from=builder /app/.next/static ./.next/static

# Copy public assets (icons, images, etc.)
COPY --from=builder /app/public ./public

# Set proper ownership
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose the default Next.js port
EXPOSE 3000

# Environment variables for production
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the Next.js server
CMD ["node", "server.js"]
