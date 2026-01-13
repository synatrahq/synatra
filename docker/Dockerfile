FROM node:22-alpine3.21 AS base
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
RUN npm install -g bun
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
FROM base AS pruner
RUN npm install -g turbo
COPY . .
ARG PACKAGE
RUN turbo prune --scope=${PACKAGE} --docker

FROM base AS builder
ARG PACKAGE
RUN if [ "$PACKAGE" = "@synatra/code-executor" ]; then \
      apk add --no-cache python3 make g++; \
    fi
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY tsconfig.json ./
RUN pnpm turbo run build --filter=${PACKAGE}

FROM node:22-alpine3.21 AS runner
RUN apk add --no-cache dumb-init ca-certificates
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
USER nodejs
ENV NODE_ENV=production
ENTRYPOINT ["dumb-init", "--"]
