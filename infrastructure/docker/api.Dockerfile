# Build context: the repository root (see docker-compose.prod.yml).
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages ./packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter api...

FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter api exec prisma generate && pnpm --filter api build

FROM base AS runtime
ENV NODE_ENV=production
# Production dependencies only; the Prisma client is generated at build time.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages ./packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter api...
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/generated apps/api/generated
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
# Migrations run as a separate step (see docker-compose.prod.yml), not on every start.
CMD ["node", "dist/src/main"]
