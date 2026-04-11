# Railway Deployment — Matex (matexhub.ca)

## Services

### 1. MCP Gateway
- **Source path:** `apps/mcp-gateway`
- **Start command:** `pnpm start` (after `pnpm build`) or `npx tsx src/index.ts` in dev
- **Port:** `3001` inside the container (`MCP_GATEWAY_PORT=3001`); public URL is HTTPS on 443 via Railway
- **Health check:** `GET /health`
- **Production example (public base URL):** `https://matexmcp-gateway-production.up.railway.app`  
  Set **`NEXT_PUBLIC_GATEWAY_URL`** on the web app to that origin (not `...:3001` unless you deliberately exposed it).

### 2. HTTP Adapters (all domains in one process)
- **Source path:** root (uses `scripts/start-http-adapters.ts`)
- **Start command:** `npx tsx scripts/start-http-adapters.ts`
- **Ports:** `4101-4122` (internal, gateway accesses via private network)

## Required Environment Variables

Both services need:

```
DATABASE_URL=postgresql://...
JWT_SECRET=<min 32 chars>
REDIS_URL=<upstash redis url> (optional, for event bus)
```

Gateway additionally needs:
```
MCP_GATEWAY_PORT=3001
MCP_DOMAIN_ENDPOINTS_JSON={"auth":"http://adapters.railway.internal:4101/tool",...}
```

## Deployment Steps

1. Create a Railway project at https://railway.app
2. Connect your GitHub repo
3. Add two services:
   - **gateway**: root directory, custom start `cd apps/mcp-gateway && npx tsx src/index.ts`
   - **adapters**: root directory, custom start `npx tsx scripts/start-http-adapters.ts`
4. Add environment variables from `.env.example`
5. Set `MCP_DOMAIN_ENDPOINTS_JSON` to use Railway private networking URLs
6. Deploy and verify health: `GET https://<gateway-url>/health`

## Custom Domain

Point `api.matexhub.ca` to the gateway service via Railway custom domain settings.
