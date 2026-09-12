# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
RUN npm install --global pnpm@10.15.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
RUN pnpm db:generate && mkdir -p public && pnpm build

FROM dependencies AS development
COPY . .
# Bind mounts can be on a different filesystem: keep pnpm on the image's store.
CMD ["sh", "-c", "CI=true pnpm install --offline --frozen-lockfile --store-dir /root/.local/share/pnpm/store --reporter=append-only && pnpm db:generate && pnpm dev --hostname 0.0.0.0"]

# The test runner uses the exact Playwright/browser version from the lockfile.
FROM dependencies AS qa
RUN pnpm exec playwright install --with-deps chromium
COPY . .
RUN pnpm db:generate

# This short-lived service completes before the application starts.
FROM dependencies AS migrate
COPY prisma ./prisma
RUN pnpm db:generate
COPY scripts ./scripts
CMD ["pnpm", "db:migrate"]

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
