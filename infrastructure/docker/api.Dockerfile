# syntax=docker/dockerfile:1
# Build context: the repository root.
#
# Targets:
#   runtime  (default) API server: production dependencies, compiled code and
#            the generated Prisma client; runs as the unprivileged `node` user.
#   migrate  One-shot `prisma migrate deploy`: Prisma CLI (a dev dependency)
#            plus schema and migrations only, no application code.
#
# No secrets are baked in: configuration arrives as environment variables at
# runtime. `.dockerignore` keeps .env files out of the build context.

ARG NODE_IMAGE=node:24.13.1-alpine3.23

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.11.0 --activate
WORKDIR /repo

# All dependencies of the api workspace, installed strictly from the lockfile.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages ./packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter api...

FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter api exec prisma generate && pnpm --filter api build

FROM deps AS migrate
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
WORKDIR /repo/apps/api
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# Production dependencies only (no CLI, no test tooling).
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages ./packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter api...

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/generated ./apps/api/generated
# Migration folder names only: readiness compares them with _prisma_migrations.
COPY apps/api/prisma/migrations ./apps/api/prisma/migrations
COPY apps/api/package.json ./apps/api/
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
# Node receives SIGTERM directly (exec form) and drains via enableShutdownHooks.
STOPSIGNAL SIGTERM
CMD ["node", "dist/src/main.js"]
