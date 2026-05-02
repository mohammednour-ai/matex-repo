# Matex — Railway Deployment Guide

## Architecture

| Railway Service | Docker Source | Port |
|---|---|---|
| `matex-backend` | `Dockerfile` (repo root) | 3001 (public) |
| `matex-web` | `apps/web-v2/Dockerfile` | 3002 (public) |

The backend container runs both the MCP Gateway (3001) and all 22 HTTP adapters (4101-4122) in one process — adapters are only reachable on localhost within the container, so no internal networking setup is needed.

---

## Step 1 — Create Railway Project

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo → `mohammednour-ai/matex-repo`
2. **Create two services:**

### Service A: `matex-backend`
- Source: GitHub (branch `master` or `claude/matex-repo-evaluation-9GPg4`)
- **Dockerfile path:** `Dockerfile` (at repo root)
- **Root directory:** `/` (repo root)
- Port: `3001`

### Service B: `matex-web`
- Source: same GitHub repo
- **Dockerfile path:** `apps/web-v2/Dockerfile`
- **Root directory:** `/` (repo root)
- Port: `3002`

---

## Step 2 — Add GitHub Secrets

Go to: `github.com/mohammednour-ai/matex-repo` → Settings → Secrets and Variables → Actions → New repository secret

| Secret Name | Value |
|---|---|
| `RAILWAY_TOKEN` | Railway token from `railway.app/account/tokens` → Create |
| `DATABASE_URL` | `postgresql://postgres:Dodo%40135791113@db.fdznxcqyrocznmrgxoge.supabase.co:5432/postgres` |
| `JWT_SECRET` | `matex-dev-jwt-secret-change-in-production-min32c` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fdznxcqyrocznmrgxoge.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_MRYptLbZCMzoUWxOpKeg0g_0xEJY7cj` |
| `RAILWAY_BACKEND_URL` | The `https://xxx.up.railway.app` URL of `matex-backend` (set after step 1) |

---

## Step 3 — Apply DB Schema

Go to: `github.com/mohammednour-ai/matex-repo` → Actions → **"Database — Apply Migrations"** → Run workflow

Required secrets for this workflow (add to GitHub Secrets):

| Secret Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | `sbp_00807daf1d042f83fd56d13e6bb5b40fcdc59722` |
| `SUPABASE_PROJECT_REF` | `fdznxcqyrocznmrgxoge` |
| `SUPABASE_DB_PASSWORD` | `Dodo@135791113` |

Type `apply` in the confirmation input and run.

---

## Step 4 — Set Railway Environment Variables

Go to: `github.com/mohammednour-ai/matex-repo` → Actions → **"Railway — Configure Environment Variables"** → Run workflow

Fill in:
- **railway_project_id** — from Railway Dashboard → your project → Settings → General → Project ID
- **railway_env_id** — from Railway Dashboard → Environments tab → click "production" → copy ID from URL
- **service_id_backend** — from Railway → click `matex-backend` service → Settings → copy Service ID
- **service_id_web** — from Railway → click `matex-web` service → Settings → copy Service ID
- **supabase_service_role_key** — from [supabase.com/dashboard/project/fdznxcqyrocznmrgxoge/settings/api](https://supabase.com/dashboard/project/fdznxcqyrocznmrgxoge/settings/api) → scroll to "service_role" → Reveal

Optional (add when you have the keys):
- **stripe_secret_key** — from `dashboard.stripe.com` → Developers → API keys
- **sendgrid_api_key** — from `app.sendgrid.com` → Settings → API Keys
- **twilio_account_sid / auth_token / phone** — from `console.twilio.com`

---

## Step 5 — Update web gateway URL

After `matex-backend` deploys and Railway generates its public URL (like `https://matex-backend-prod.up.railway.app`):

1. Add it as GitHub secret `RAILWAY_BACKEND_URL`
2. Re-run the **Railway — Configure Environment Variables** workflow (only the web vars job needs to run again)
3. Redeploy `matex-web`

---

## Step 6 — Generate public domains (mandatory)

Railway does **not** auto-create a public domain. Until you do this, deploys will show "Completed" in the Railway UI but the service is unreachable from the internet — which is exactly the "deployment completed but not online" symptom.

For **each** of `matex-backend` and `matex-web`:

1. Open the service in the Railway UI.
2. **Settings → Networking → Public Networking → Generate Domain.**
3. Copy the generated `https://*.up.railway.app` URL.
4. For `matex-backend`: add it as the GitHub secret `RAILWAY_BACKEND_URL` and re-run the **Railway — Configure Environment Variables** workflow so the web service picks it up as `MCP_GATEWAY_URL` / `NEXT_PUBLIC_GATEWAY_URL`.

---

## Checklist

- [ ] Railway project created with 2 services
- [ ] GitHub secret `RAILWAY_TOKEN` added
- [ ] GitHub secrets for DB URL, JWT, Supabase added
- [ ] DB schema applied (Actions → Database — Apply Migrations)
- [ ] Railway env vars set (Actions → Railway — Configure Environment Variables)
- [ ] Supabase service role key obtained and set
- [ ] **Public domains generated for both services** (Step 6)
- [ ] `matex-web` GATEWAY_URL updated with backend Railway URL
- [ ] Stripe/SendGrid/Twilio keys added when ready

---

## Troubleshooting — "Deployment completed but not online"

This is a real failure mode, not a UI quirk. Walk down the list in order:

1. **Domain not generated.** See Step 6 above. The Railway UI says "Completed" once the build finishes; without a generated public domain there is no externally reachable URL.
2. **Healthcheck failing.** Both services have explicit healthcheck endpoints:
   - Backend: `GET /health` (defined in `apps/mcp-gateway/src/index.ts`)
   - Web: `GET /api/health` (defined in `apps/web-v2/src/app/api/health/route.ts`)

   The healthcheck path is set in each service's `railway.toml`. Tail the deploy logs in the Railway UI; if you see repeated `Healthcheck failed` lines, the container is running but the probe can't reach the endpoint — usually a `PORT` mismatch.
3. **`PORT` mismatch.** Do **not** set `PORT` manually in Railway env vars for either service. Railway injects its own `PORT` at runtime; the apps listen on `0.0.0.0:$PORT`. If `PORT` is hardcoded in the service variables (e.g. `PORT=3001`), Railway still routes public HTTPS traffic to its own injected port, so the healthcheck probe never reaches the container — this is the most common cause of "deployment completed but not online". The `railway-setup.yml` workflow no longer sets `PORT` for either service; if you ran an older version of the workflow, remove the `PORT` variable from both services in the Railway dashboard (Service → Variables → delete `PORT`) and redeploy.
4. **Crash loop.** "Completed" only describes the build, not the runtime. Tail logs; if the container is restarting, check `restartPolicyMaxRetries` (set to 3 in our `railway.toml`) and the failing line.
5. **Outbound DB unreachable.** If the gateway boots fine but `/health` returns DB `not_configured`, check `DATABASE_URL` — the URL-encoded password matters (`@` → `%40`). The example in this doc already shows the encoded form.
6. **Wrong root directory in Railway service settings.** Both services build from the **monorepo root** (`/`), with the Dockerfile path differing per service:
   - `matex-backend`: `Dockerfile`
   - `matex-web`: `apps/web-v2/Dockerfile`
   If the Root Directory was set to `apps/web-v2`, the workspace lockfile won't be found and the build will silently fall back to a different image — sometimes producing a "completed" status but a non-listening container.

If all of the above check out, redeploy the service (Deployments → ⋯ → Redeploy) and re-test `https://<service-domain>/api/health` (web) or `/health` (backend). Both should return `200` with a small JSON payload.
