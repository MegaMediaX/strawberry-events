# syntax=docker/dockerfile:1

# ---- deps ----
FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# A dummy DATABASE_URL lets `next build` evaluate modules that import Prisma.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# The prisma CLI plus its dependency closure, for `migrate deploy` and seeding
# at runtime. Next's standalone tracing only includes what the app imports, so
# the CLI (a devDependency) and its deps are absent from the build output.
RUN node scripts/collect-prisma-cli.mjs /prisma-cli/node_modules

# ---- runner ----
FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Standalone server output.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma schema, generated client, and the CLI closure (prisma, @prisma/*, and
# the CLI's own dependencies — effect, c12, citty, …). Copying only the prisma
# packages, as this did before, yields a CLI that starts and then dies with
# "Cannot find module 'effect'". Must come AFTER the standalone copy above so
# both node_modules trees merge.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /prisma-cli/node_modules ./node_modules

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
