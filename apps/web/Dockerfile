FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @maia/contracts --filter @maia/web

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
# NEXT_PUBLIC_* is inlined into the client bundle at build time, so it must be present here, not at
# runtime. It is a public URL by definition (the browser calls it directly).
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @maia/contracts build && pnpm --filter @maia/web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/contracts/package.json packages/contracts/
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY --from=build /app/packages/contracts/dist packages/contracts/dist
# next start needs the standalone-ish .next plus public/ and the config.
COPY --from=build /app/apps/web/.next apps/web/.next
COPY --from=build /app/apps/web/next.config.ts apps/web/next.config.ts
COPY --from=build /app/apps/web/public apps/web/public

USER app
EXPOSE 3000
WORKDIR /app/apps/web
# `next` is resolved from the package's own node_modules: under pnpm it is a symlink into the
# store, so addressing it by a relative path from the workspace root would not resolve.
CMD ["node", "node_modules/next/dist/bin/next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
