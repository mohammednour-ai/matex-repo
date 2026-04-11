# Railway Deployment — Matex (matexhub.ca)

## Railway “Port” / networking

Railway injects **`PORT`** (the value you set in the service **Settings → Networking → Port**). The app must listen on that port.

| Service        | What to enter in Railway | How the app picks it up |
|----------------|--------------------------|-------------------------|
| **MCP Gateway** | `3001` (recommended)     | `PORT` first, else `MCP_GATEWAY_PORT`, else `3001` |
| **web-v2**      | `3000` or match your env | `next start` uses **`PORT`** (Next.js default) |

For **local** web-v2 production-style runs on 3002: `PORT=3002 pnpm start` (or set `PORT` in `.env.local`). Dev still uses `pnpm dev` on 3002.

## Services

### 1. MCP Gateway
- **Source path:** `apps/mcp-gateway`
- **Start command:** `pnpm start` (after `pnpm build`) or `npx tsx src/index.ts` in dev
- **Port:** Set Railway port to **`3001`** (or any value — must match **`PORT`**). Optional: `MCP_GATEWAY_PORT=3001` for local/docs; production uses **`PORT`** from Railway.
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
