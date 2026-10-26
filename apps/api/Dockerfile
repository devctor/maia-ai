# ---------------------------------------------------------------- build
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------- deps
# Manifests only: a change in source must not invalidate the dependency layer.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @maia/contracts --filter @maia/api

# ---------------------------------------------------------------- build
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @maia/contracts build \
  && pnpm --filter @maia/api build

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /app

# A non-root user: this process holds a database password and an AI provider key.
RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/contracts/package.json packages/contracts/
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules

COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/api/dist apps/api/dist
# The migration files ship next to the build: the container applies them on start.
COPY apps/api/drizzle apps/api/dist/drizzle

USER app
EXPOSE 3001

# Migrations before the server: a container that answers traffic against an unmigrated schema is
# worse than one that fails to start.
CMD ["sh", "-c", "node apps/api/dist/db/migrate.js && node apps/api/dist/main.js"]
