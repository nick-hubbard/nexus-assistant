# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
  && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

FROM base AS deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/brain/package.json apps/brain/package.json
COPY packages/protocol/package.json packages/protocol/package.json

RUN pnpm install --frozen-lockfile --filter @open-nexus/brain... --prod=false --ignore-scripts \
  && pnpm --dir apps/brain rebuild better-sqlite3 \
  && pnpm rebuild esbuild

FROM base AS runtime

ENV NODE_ENV=production
ENV BRAIN_HOST=0.0.0.0
ENV BRAIN_PORT=4317
ENV BRAIN_DATA_DIR=/data
ENV BRAIN_AI_PROVIDER=fake

RUN groupadd --system --gid 10001 open-nexus \
  && useradd --system --uid 10001 --gid open-nexus --home-dir /app open-nexus \
  && mkdir -p /data \
  && chown -R open-nexus:open-nexus /data /app

COPY --from=deps --chown=open-nexus:open-nexus /app/node_modules ./node_modules
COPY --from=deps --chown=open-nexus:open-nexus /app/apps/brain/node_modules ./apps/brain/node_modules
COPY --from=deps --chown=open-nexus:open-nexus /app/packages/protocol/node_modules ./packages/protocol/node_modules
COPY --chown=open-nexus:open-nexus package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY --chown=open-nexus:open-nexus apps/brain ./apps/brain
COPY --chown=open-nexus:open-nexus packages/protocol ./packages/protocol

USER open-nexus

EXPOSE 4317
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.BRAIN_PORT || '4317') + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["./apps/brain/node_modules/.bin/tsx", "apps/brain/src/index.ts"]
