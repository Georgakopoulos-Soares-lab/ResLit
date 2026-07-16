# ==============================================================
# ResLit — Production Dockerfile for Railway Deployment
# Multi-stage build with pnpm + Next.js standalone output
# ==============================================================

# --------------------------------------------------------------
# Stage 1 — Install dependencies
# --------------------------------------------------------------
FROM node:20-alpine AS installer
WORKDIR /app

# better-sqlite3 is a native module — Alpine (musl) needs a build toolchain
# to compile it reliably, rather than depending on a prebuilt binary being
# available for this platform.
RUN apk add --no-cache python3 make g++

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy package manifests for layer caching
COPY pnpm-lock.yaml package.json .npmrc ./

# Install ALL dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile

# --------------------------------------------------------------
# Stage 2 — Build the Next.js app
# --------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm (each Docker stage is isolated — tools don't carry over)
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy installed node_modules from installer
COPY --from=installer /app/node_modules ./node_modules

# Copy source code
COPY . .

# Create a throwaway schema so any page that queries the database during
# static generation doesn't crash the build with "no such table" — this is
# NOT the real database (which only exists on the Railway Volume, mounted
# at runtime, invisible to this build stage), just enough structure for
# build-time rendering to succeed. Real data is seeded separately post-deploy.
RUN mkdir -p data && pnpm db:migrate

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

# Next's standalone output above is deliberately minimal (no pnpm, no dev
# tooling, no scripts/) — enough to serve the app but not to run one-off
# production tasks like the data seed. Give those their own isolated tree
# with a full node_modules, so they don't disturb the standalone app's
# carefully traced dependencies. Run via: cd admin && pnpm db:seed
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=installer /app/node_modules ./admin/node_modules
COPY --from=builder /app/scripts ./admin/scripts
COPY --from=builder /app/lib ./admin/lib
COPY --from=builder /app/package.json ./admin/package.json
COPY --from=builder /app/pnpm-lock.yaml ./admin/pnpm-lock.yaml
COPY --from=builder /app/tsconfig.json ./admin/tsconfig.json
COPY --from=builder /app/drizzle.config.ts ./admin/drizzle.config.ts

# Directory for the SQLite database file — expected to be a Railway Volume
# mounted at exactly this path, so the database survives redeploys/restarts
# instead of living on the container's disposable filesystem.
RUN mkdir -p /data

# Set proper ownership
RUN chown -R nextjs:nodejs /app /data

# Switch to non-root user
USER nextjs

# Expose the default Next.js port
EXPOSE 3000

# Environment variables for production
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_PATH=/data/reslit.db

# Start the Next.js server
CMD ["node", "server.js"]
