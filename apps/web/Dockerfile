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

# Ownership for the unprivileged runtime user (see USER below). node:20-slim
# already ships a `node` user at uid 1000, so none is created here. WORKDIR made
# /app root-owned, and Next writes its incremental cache under /app/.next at
# runtime (the app calls revalidatePath), so /app ITSELF must be owned — not
# just the files the COPYs below bring in.
#
# .uploads is the event cover-photo root (EVENT_UPLOADS_DIR in compose.yaml).
# Compose mounts the `uploads-data` named volume there. Docker seeds a NEWLY
# created named volume from the image directory underneath it, ownership
# included, so fresh deployments get a node-owned uploads dir unattended. An
# EXISTING volume keeps the ownership it already has: a stack that previously
# ran as root has a root-owned /app/.uploads, and saveCoverImage() will fail
# with EACCES until the operator chowns that volume ONCE, on the host:
#   docker run --rm -v <project>_uploads-data:/data alpine chown -R 1000:1000 /data
RUN mkdir -p /app/.uploads/event-covers && chown -R node:node /app

# Standalone server output.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Prisma schema, generated client, and the CLI closure (prisma, @prisma/*, and
# the CLI's own dependencies — effect, c12, citty, …). Copying only the prisma
# packages, as this did before, yields a CLI that starts and then dies with
# "Cannot find module 'effect'". Must come AFTER the standalone copy above so
# both node_modules trees merge.
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /prisma-cli/node_modules ./node_modules

# Drop root: the standalone server needs no privileged capability. Port 3000 is
# above the 1024 privileged-port cutoff, so an unprivileged user can bind it.
# `docker compose exec` and the compose healthcheck inherit this user — both
# only read, and the prisma CLI's `migrate deploy` / prisma/seed.mjs write to
# the database, not to the filesystem.
USER node

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
