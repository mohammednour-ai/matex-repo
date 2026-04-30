#!/bin/sh
set -e

echo "[matex] Starting HTTP adapters..."
tsx /app/scripts/start-http-adapters.ts &
ADAPTERS_PID=$!

# Give adapters 2s to bind their ports before gateway starts routing to them
sleep 2

echo "[matex] Starting MCP Gateway on port ${PORT:-3001}..."
exec node /app/apps/mcp-gateway/dist/index.js

