# Build context: the repository root (see docker-compose.prod.yml).
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
# The API URL is baked into the browser bundle at build time.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages ./packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter my-app...
COPY apps/web apps/web
RUN pnpm --filter my-app build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages ./packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter my-app...
COPY --from=build /repo/apps/web/.next apps/web/.next
COPY apps/web/public apps/web/public
COPY apps/web/next.config.ts apps/web/next.config.ts
WORKDIR /repo/apps/web
USER node
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-p", "3000"]
