# ── Matex Web (Next.js 14) ────────────────────────────────────────────────────
# Build context: monorepo root  (Railway: set "Root Directory" to repo root)
FROM node:20-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

# ── Workspace manifests ───────────────────────────────────────────────────────
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# ── Source ────────────────────────────────────────────────────────────────────
COPY packages/shared/types/ packages/shared/types/
COPY packages/shared/utils/ packages/shared/utils/
COPY apps/web-v2/           apps/web-v2/

# ── Install ───────────────────────────────────────────────────────────────────
RUN pnpm install --frozen-lockfile \
      --filter @matex/types \
      --filter @matex/utils \
      --filter @matex/web-v2

# Build shared utils (web may import types)
RUN pnpm --filter @matex/types run build 2>/dev/null || true
RUN pnpm --filter @matex/utils run build 2>/dev/null || true

# ── Next.js build ─────────────────────────────────────────────────────────────
WORKDIR /app/apps/web-v2
RUN pnpm build

# Local-dev default port. In Railway production, the runtime PORT env var is
# injected by the platform and overrides this — `next start` reads PORT at
# startup and binds 0.0.0.0:$PORT.
EXPOSE 3002

CMD ["pnpm", "start"]
