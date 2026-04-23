# ── Matex Backend ────────────────────────────────────────────────────────────
# Single container: MCP Gateway (port 3001) + all 22 HTTP adapters (4101-4122)
# Build context: monorepo root
FROM node:20-alpine AS base
RUN npm install -g pnpm@9 tsx

WORKDIR /app

# ── Workspace manifests (cached layer) ────────────────────────────────────────
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# ── Source ────────────────────────────────────────────────────────────────────
COPY packages/shared/types/          packages/shared/types/
COPY packages/shared/utils/          packages/shared/utils/
COPY packages/shared/mcp-http-adapter/ packages/shared/mcp-http-adapter/
COPY apps/mcp-gateway/               apps/mcp-gateway/
COPY scripts/start-http-adapters.ts  scripts/start-http-adapters.ts

# ── Install & build ──────────────────────────────────────────────────────────
RUN pnpm install --frozen-lockfile \
      --filter @matex/types \
      --filter @matex/utils \
      --filter @matex/mcp-http-adapter \
      --filter @matex/mcp-gateway

# Build shared utils first (gateway & adapter depend on its types)
RUN pnpm --filter @matex/types    run build 2>/dev/null || true
RUN pnpm --filter @matex/utils    run build

# Build gateway for production
RUN pnpm --filter @matex/mcp-gateway run build

# ── Runtime ───────────────────────────────────────────────────────────────────
EXPOSE 3001
# Adapters run on 4101-4122 inside the container (no external exposure needed)

COPY docker-start.sh /docker-start.sh
RUN chmod +x /docker-start.sh

CMD ["/docker-start.sh"]
