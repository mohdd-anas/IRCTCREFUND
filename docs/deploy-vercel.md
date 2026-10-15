# Deploying RailRefund to Vercel

## Prerequisites

- A [Vercel account](https://vercel.com/signup)
- Your GitHub repo pushed with all the sprint code

---

## Step 1 — Import the Project

1. Go to **[vercel.com/new](https://vercel.com/new)**
2. Select the **REFUND_PROJECT** repository (connect GitHub if you haven't)
3. Vercel will auto-detect the monorepo

## Step 2 — Configure the Project Settings

| Setting | Value |
|---|---|
| **Framework Preset** | Next.js |
| **Root Directory** | `.` *(leave as repo root)* |
| **Build Command** | `npm run build --workspace=packages/refund-engine && npm run build --workspace=apps/web` |
| **Output Directory** | `apps/web/.next` |
| **Install Command** | `npm install` |

> [!NOTE]
> The `vercel.json` at the repo root already provides these defaults. Vercel will pick them up automatically — you only need to confirm them on the dashboard.

## Step 3 — Set Environment Variables

Navigate to **Settings → Environment Variables** and add:

| Variable | Required | Example | Notes |
|---|---|---|---|
| `PNR_HASH_SALT` | **Yes** | `rr-prod-3f8a9c…` | Min 16 chars. Used for SHA-256 PNR hashing. Generate with `openssl rand -hex 32` |
| `PNR_PROVIDER` | No | `rapidapi` | `"rapidapi"`, `"mock"`, or `"template"`. Auto-detected as `rapidapi` if `RAPIDAPI_KEY` is present. |
| `RAPIDAPI_KEY` | For Live Data | `your-x-rapidapi-key` | Free key from [RapidAPI](https://rapidapi.com). Enables real PNR status lookups! |
| `RAPIDAPI_HOST` | No | `irctc1.p.rapidapi.com` | RapidAPI host header (defaults to `irctc1.p.rapidapi.com`) |
| `RAPIDAPI_PNR_ENDPOINT`| No | `https://…/getPNRStatus` | Endpoint URL (defaults to standard IRCTC endpoint) |
| `ALLOW_MOCK_PROVIDER` | No | `true` | Set to `true` **only** for preview/dev. In production, omit or set to `false`. |
| `RATE_LIMIT_MAX_REQUESTS` | No | `10` | Defaults to 10 per window |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Defaults to 60 s |
| `PROVIDER_TIMEOUT_MS` | No | `5000` | Provider HTTP timeout |
| `PROVIDER_MAX_RETRIES` | No | `2` | Provider retry count |
| `DATABASE_URL` | No | `postgres://…` | Vercel Postgres or external. Omit for in-memory fallback |
| `REDIS_URL` | No | `redis://…` | Upstash Redis URL. Omit for in-memory cache |

> [!IMPORTANT]
> In production, when using real PNR lookups, configure `RAPIDAPI_KEY`. If `ALLOW_MOCK_PROVIDER=false` (default) and no provider key is configured, the system fails closed as required by privacy and compliance standards.

### Quick generate a salt:
```bash
openssl rand -hex 32
```

## Step 4 — Deploy

Click **Deploy**. Vercel will:
1. Install all workspace dependencies (`npm install`)
2. Build the refund-engine package (`tsc -b`)
3. Build the Next.js web app (`next build`)
4. Deploy serverless functions for the API routes

First deploy typically takes ~60 seconds.

## Step 5 — Verify

After deploy completes:

| Check | URL |
|---|---|
| Health endpoint | `https://your-domain.vercel.app/api/health` |
| Homepage loads | `https://your-domain.vercel.app/` |
| PNR lookup works | Enter `1234567890` on homepage (mock provider) |
| Static pages | `/about`, `/privacy`, `/terms`, `/train-ticket-refund-rules` |

---

## Preview Deployments

Every PR automatically gets a **preview deployment**. For previews, add `ALLOW_MOCK_PROVIDER=true` under the **Preview** environment scope so the mock provider is available for testing.

## Custom Domain

1. Go to **Settings → Domains**
2. Add your domain (e.g. `railrefund.in`)
3. Follow the DNS configuration instructions
4. SSL is provisioned automatically

## Troubleshooting

| Issue | Fix |
|---|---|
| Build fails with "Cannot find module @railrefund/refund-engine" | Ensure Root Directory is `.` (repo root), not `apps/web` |
| 500 on `/api/pnr/lookup` in production | Set `ALLOW_MOCK_PROVIDER=true` or wire a real provider |
| Rate limiting not working | Rate limiter defaults to in-memory; configure Upstash Redis for serverless-compatible persistence |
| "PNR_HASH_SALT is required" error | Add the env var in Vercel Settings → Environment Variables |
