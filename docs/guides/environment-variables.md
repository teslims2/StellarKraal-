# Environment Variables

This guide documents every environment variable used by StellarKraal. Copy `.env.example` to `.env` and fill in the values before starting any service.

```bash
cp .env.example .env
```

Variables marked **Required** must be set or the service will refuse to start. Variables marked **Optional** have safe defaults that work for local development.

> **Security note:** Never commit real secrets to version control. Variables marked with a GitHub Secret name must be stored in GitHub Actions (Settings → Secrets and variables → Actions) for CI/CD.

---

## Shared

These variables are consumed by both the frontend build and the backend runtime.

### `NEXT_PUBLIC_NETWORK`

| | |
|---|---|
| Required | Yes |
| Format | `testnet` \| `mainnet` |
| Default | `testnet` |
| GitHub Secret | `NEXT_PUBLIC_NETWORK` |

Selects the Stellar network. Use `testnet` for all non-production environments. Changing this to `mainnet` without updating `RPC_URL` and `CONTRACT_ID` to matching production values will cause all contract calls to fail.

### `RPC_URL`

| | |
|---|---|
| Required | Yes |
| Format | HTTPS URL |
| Example | `https://soroban-testnet.stellar.org` |
| GitHub Secret | `RPC_URL` |

Soroban JSON-RPC endpoint the backend uses to submit transactions and query contract state. The public testnet endpoint is `https://soroban-testnet.stellar.org`. For mainnet use `https://soroban-mainnet.stellar.org` or a private RPC provider.

### `CONTRACT_ID`

| | |
|---|---|
| Required | Yes |
| Format | 56-character Stellar contract/account ID (`C...`) |
| GitHub Secret | `CONTRACT_ID` |

The deployed Soroban contract address. Obtain this after running `stellar contract deploy`. A mismatch between this value and the actual on-chain deployment will cause all loan lifecycle operations to fail silently or with cryptic RPC errors.

---

## Frontend

These variables are embedded into the Next.js bundle at build time. Any change requires a rebuild (`npm run build`).

### `NEXT_PUBLIC_API_URL`

| | |
|---|---|
| Required | Yes |
| Format | HTTP(S) URL, no trailing slash |
| Default (local) | `http://localhost:3001` |
| GitHub Secret | `NEXT_PUBLIC_API_URL` |

Base URL the browser uses to reach the backend REST API. In production this must be the public HTTPS URL of the backend service. An incorrect value causes all API calls from the frontend to fail with network errors.

### `NEXT_PUBLIC_RPC_URL`

| | |
|---|---|
| Required | Yes |
| Format | HTTPS URL |
| Default (local) | `https://soroban-testnet.stellar.org` |
| GitHub Secret | `NEXT_PUBLIC_RPC_URL` |

Soroban RPC URL used by the browser-side Stellar SDK (e.g. Freighter wallet integration). Usually the same value as `RPC_URL`. Exposed to the browser, so do not use a private RPC endpoint that carries credentials in the URL.

---

## Backend

These variables are read at runtime by the Express API server (`backend/src/config.ts`). The server validates all required variables on startup using Zod and exits with a descriptive error if any are missing or malformed.

### `PORT`

| | |
|---|---|
| Required | No |
| Format | Integer 1–65535 |
| Default | `3001` |

TCP port the Express server listens on. Change this if port 3001 is already in use on your machine. The Docker Compose file maps this port to the host automatically.

### `NODE_ENV`

| | |
|---|---|
| Required | No |
| Format | `development` \| `production` \| `test` |
| Default | `development` |

Controls logging verbosity, error detail in API responses, and certain security defaults. Always set to `production` in deployed environments — this disables stack traces in error responses and enables stricter security headers.

### `FRONTEND_URL`

| | |
|---|---|
| Required | In production |
| Format | HTTP(S) URL, no trailing slash |
| Default (local) | `http://localhost:3000` |
| GitHub Secret | `FRONTEND_URL` |

Allowed CORS origin. The backend rejects cross-origin requests from any other origin. In production set this to the exact URL of the deployed frontend (e.g. `https://app.stellarkraal.example.com`).

### `JWT_SECRET`

| | |
|---|---|
| Required | In production |
| Format | Arbitrary string, minimum 32 characters recommended |
| GitHub Secret | `JWT_SECRET` |

Secret used to sign and verify JWT access tokens. A weak or default value allows anyone to forge valid tokens. Generate a strong value with:

```bash
openssl rand -hex 32
```

Rotate this secret by updating the value and redeploying — all existing tokens will be immediately invalidated.

### `WEBHOOK_SECRET`

| | |
|---|---|
| Required | No |
| Format | Hex or arbitrary string, minimum 16 characters |
| GitHub Secret | `WEBHOOK_SECRET` |

HMAC-SHA256 secret used to verify the signature on incoming webhook payloads. If unset, webhook signature verification is skipped (not recommended in production). Generate with:

```bash
openssl rand -hex 32
```

### `ADMIN_API_KEY`

| | |
|---|---|
| Required | No |
| Format | Arbitrary string, minimum 8 characters |
| GitHub Secret | `ADMIN_API_KEY` |

Bearer token required to access `/api/admin/*` endpoints. If unset, admin routes return 403. Rotate immediately if compromised. Generate with:

```bash
openssl rand -hex 16
```

### Rate Limiting

All rate limits are expressed as **requests per minute per IP address**.

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_GLOBAL` | `60` | Applied to every route as a baseline ceiling |
| `RATE_LIMIT_AUTH` | `10` | Applied to `/auth/*` routes to slow brute-force attempts |
| `RATE_LIMIT_READ` | `100` | Applied to read-only GET routes |
| `RATE_LIMIT_WRITE` | `10` | Applied to state-changing POST/PUT/DELETE routes |

Increase these values if legitimate traffic is being throttled. Decrease them for tighter abuse protection in production.

### Request Timeouts

| Variable | Default | Description |
|---|---|---|
| `TIMEOUT_GLOBAL_MS` | `30000` | Maximum milliseconds for any request before a 408 is returned |
| `TIMEOUT_WRITE_MS` | `15000` | Maximum milliseconds for write operations (loan origination, collateral updates) |

Values are in milliseconds. Increase `TIMEOUT_WRITE_MS` if Soroban transaction submission is slow on your network.

### RPC Connection Pool

| Variable | Default | Description |
|---|---|---|
| `POOL_MIN` | `2` | Minimum persistent RPC connections to keep open |
| `POOL_MAX` | `10` | Maximum concurrent RPC connections |

`POOL_MIN` must be ≤ `POOL_MAX`. Increase `POOL_MAX` under high write load; decrease it to reduce resource usage on low-traffic deployments.

### `APPRAISAL_CACHE_TTL_MS`

| | |
|---|---|
| Required | No |
| Format | Positive integer (milliseconds) |
| Default | `300000` (5 minutes) |

How long collateral appraisal results are cached in memory before a fresh RPC call is made. Increase this to reduce RPC traffic; decrease it if you need near-real-time price accuracy for liquidation decisions.

---

## Alerting

These variables configure the backend alert dispatcher. All are optional — the corresponding alert channel is silently disabled if the variable is unset.

### `SLACK_WEBHOOK_URL`

| | |
|---|---|
| Required | No |
| Format | `https://hooks.slack.com/services/T.../B.../...` |
| GitHub Secret | `SLACK_WEBHOOK_URL` |

Slack incoming webhook URL for deployment notifications and operational alerts. Create one at <https://api.slack.com/messaging/webhooks>. The same webhook is used by the staging deployment workflow.

### `PAGERDUTY_ROUTING_KEY`

| | |
|---|---|
| Required | No |
| Format | 32-character alphanumeric string |
| GitHub Secret | `PAGERDUTY_ROUTING_KEY` |

PagerDuty Events API v2 routing (integration) key. Only critical-severity alerts (e.g. liquidation failures, RPC outages) are sent to PagerDuty. Find this key in PagerDuty under Services → Integrations → Events API v2.

### `RUNBOOK_BASE_URL`

| | |
|---|---|
| Required | No |
| Format | HTTPS URL, no trailing slash |
| Default | `https://github.com/teslims2/StellarKraal-/blob/main/docs/runbooks` |

Base URL prepended to runbook paths in alert messages. Override this if you host runbooks elsewhere (e.g. Confluence, Notion).

---

## Quick-reference table

| Variable | Service | Required | Default |
|---|---|---|---|
| `NEXT_PUBLIC_NETWORK` | Shared | Yes | `testnet` |
| `RPC_URL` | Shared | Yes | — |
| `CONTRACT_ID` | Shared | Yes | — |
| `NEXT_PUBLIC_API_URL` | Frontend | Yes | `http://localhost:3001` |
| `NEXT_PUBLIC_RPC_URL` | Frontend | Yes | `https://soroban-testnet.stellar.org` |
| `PORT` | Backend | No | `3001` |
| `NODE_ENV` | Backend | No | `development` |
| `FRONTEND_URL` | Backend | Prod only | `http://localhost:3000` |
| `JWT_SECRET` | Backend | Prod only | — |
| `WEBHOOK_SECRET` | Backend | No | — |
| `ADMIN_API_KEY` | Backend | No | — |
| `RATE_LIMIT_GLOBAL` | Backend | No | `60` |
| `RATE_LIMIT_AUTH` | Backend | No | `10` |
| `RATE_LIMIT_READ` | Backend | No | `100` |
| `RATE_LIMIT_WRITE` | Backend | No | `10` |
| `TIMEOUT_GLOBAL_MS` | Backend | No | `30000` |
| `TIMEOUT_WRITE_MS` | Backend | No | `15000` |
| `POOL_MIN` | Backend | No | `2` |
| `POOL_MAX` | Backend | No | `10` |
| `APPRAISAL_CACHE_TTL_MS` | Backend | No | `300000` |
| `SLACK_WEBHOOK_URL` | Alerting | No | — |
| `PAGERDUTY_ROUTING_KEY` | Alerting | No | — |
| `RUNBOOK_BASE_URL` | Alerting | No | (GitHub URL) |
