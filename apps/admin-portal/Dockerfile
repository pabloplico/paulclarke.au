# =============================================================================
# Admin Portal — Production
# =============================================================================
# Usage:
#   docker build -t admin-portal -f apps/admin-portal/Dockerfile .
#   (run from repo root)
#
#   With Playwright (for URL scraping):
#   docker build --build-arg INSTALL_PLAYWRIGHT=true -t admin-portal -f apps/admin-portal/Dockerfile .
# =============================================================================

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY .npmrc* ./
COPY apps/admin-portal/package.json ./apps/admin-portal/
COPY packages/biome-config/package.json ./packages/biome-config/
COPY packages/prettier-config/package.json ./packages/prettier-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/
RUN pnpm install --frozen-lockfile

# --- Build ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
# Copy only what the admin-portal build needs (not the whole repo)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/admin-portal ./apps/admin-portal
RUN pnpm turbo run build --filter="@repo/*"
RUN pnpm turbo run build --filter="admin-portal"

# --- Production ---
FROM node:22-alpine AS runner

ARG INSTALL_PLAYWRIGHT=false

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Install Chromium for Playwright URL scraping when enabled
RUN if [ "$INSTALL_PLAYWRIGHT" = "true" ]; then \
      apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont; \
    fi

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /app/apps/admin-portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin-portal/.next/static ./apps/admin-portal/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin-portal/public ./apps/admin-portal/public

USER nextjs
EXPOSE 3001
CMD ["node", "apps/admin-portal/server.js"]
