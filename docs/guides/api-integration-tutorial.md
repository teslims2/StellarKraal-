# Tutorial: Integrating an External App with the StellarKraal API

This walks through using the StellarKraal backend API from an external application: registering
livestock collateral, requesting a loan, and monitoring loan status changes via webhooks instead
of polling.

All endpoints below are relative to the backend base path `/api/v1` (e.g.
`http://localhost:3001/api/v1` in local development).

## 1. Register collateral

```http
POST /api/v1/collateral/register
Content-Type: application/json

{
  "owner": "GABCD...WXYZ",
  "animal_type": "cattle",
  "count": 5,
  "appraised_value": 2500
}
```

- `owner` — the borrower's Stellar public key.
- `animal_type` — free-text species/category.
- `count` — number of animals in this collateral batch (positive integer).
- `appraised_value` — appraised value in the platform's base currency unit (positive integer).

A successful response returns the created collateral record, including its `id`, which you'll
need to look it up later via `GET /api/v1/collateral/:id`.

To register multiple batches in one call, use `POST /api/v1/collateral/register/batch` with
`{ "items": [ { ... }, { ... } ] }` (up to 50 entries).

## 2. Request a loan against the collateral

```http
POST /api/v1/loan/request
Content-Type: application/json

{
  "collateral_id": "<id from step 1>",
  "borrower": "GABCD...WXYZ",
  "amount": 1000
}
```

The loan is created on-chain via the Soroban contract; the response includes the loan `id` and
transaction result. You can fetch current on-chain loan state at any time with:

```http
GET /api/v1/loan/:id
GET /api/v1/health/:loanId   # health factor
```

Polling these endpoints works, but for production integrations prefer webhooks (below) so your
app is notified the moment loan state changes instead of on a polling interval.

## 3. Set up a webhook subscription

Register your endpoint once to start receiving loan lifecycle events:

```http
POST /api/v1/webhooks
Content-Type: application/json

{
  "url": "https://your-app.example.com/hooks/stellarkraal",
  "events": ["loan.activated", "loan.repaid", "loan.liquidated"],
  "encrypt": false
}
```

A successful response:

```json
{
  "id": "wh_01hx...",
  "url": "https://your-app.example.com/hooks/stellarkraal",
  "events": ["loan.activated", "loan.repaid", "loan.liquidated"],
  "secret": "sk_whsec_...",
  "createdAt": 1732000000000
}
```

Store `secret` securely — it is returned **once** and is required to verify every delivery.
If you set `"encrypt": true`, payloads are additionally encrypted with AES-256-GCM; see
[docs/WEBHOOK_ENCRYPTION.md](../WEBHOOK_ENCRYPTION.md) for the format and key derivation.

### Events you will receive

Deliveries are `POST`ed to your `url` with a body like:

```json
{
  "event": "loan.repaid",
  "payload": {
    "loanId": "loan_abc123",
    "borrower": "GABCD...WXYZ",
    "amount": 1000,
    "timestamp": 1732000000000
  },
  "timestamp": 1732000000000
}
```

| Event | Triggered when |
|---|---|
| `loan.activated` | Loan is approved and funds are disbursed to the borrower |
| `loan.repaid` | Borrower repays principal plus interest |
| `loan.liquidated` | Collateral is liquidated due to insufficient health factor |

For the full set of on-chain event schemas the backend listens for, see
[docs/protocol/events.md](../protocol/events.md).

### Verifying delivery authenticity

Every delivery includes an `X-StellarKraal-Signature` header. Verify it before trusting the
payload:

```js
const crypto = require("crypto");

function isValidSignature(rawBody, signatureHeader, secret) {
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}
```

Deliveries retry with exponential backoff on failure; see
[docs/WEBHOOK_RETRY.md](../WEBHOOK_RETRY.md) for retry counts and timing.

### Managing your webhook

```http
GET    /api/v1/admin/webhooks          # list registered webhooks
GET    /api/v1/admin/webhooks/logs     # delivery attempt logs
DELETE /api/v1/webhooks/:id            # unregister
```

## 4. Error handling and retry patterns

The API returns structured error responses. Every non-2xx response body includes:

```json
{
  "error": {
    "code": "COLLATERAL_NOT_FOUND",
    "message": "No collateral record found with the given id",
    "requestId": "req_01hx..."
  }
}
```

Include `requestId` when reporting issues to support — it correlates to the server log entry.

### HTTP status codes

| Status | Meaning | Recommended action |
|---|---|---|
| `400 Bad Request` | Invalid input | Fix the request body; do not retry unchanged |
| `401 Unauthorized` | Missing or expired JWT | Re-authenticate and retry once |
| `404 Not Found` | Resource does not exist | Do not retry |
| `409 Conflict` | Duplicate request (idempotency clash) | Log and discard; the previous request succeeded |
| `422 Unprocessable Entity` | Business-rule violation (e.g. insufficient collateral) | Surface to the user |
| `429 Too Many Requests` | Rate limit exceeded | Back off using the `Retry-After` header |
| `500 / 503` | Transient server error | Retry with exponential backoff (see below) |

### Retry logic

Retry only on `429` and `5xx` responses. Use exponential backoff with jitter to avoid
thundering-herd when the service recovers:

```js
async function callWithRetry(fn, { maxAttempts = 4, baseDelayMs = 250 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status ?? 0;
      const retryable = status === 429 || (status >= 500 && status < 600);
      if (!retryable || attempt === maxAttempts) throw err;

      // Respect Retry-After when present (value is seconds)
      const retryAfter = err?.response?.headers?.["retry-after"];
      const delay = retryAfter
        ? Number(retryAfter) * 1000
        : baseDelayMs * 2 ** (attempt - 1) + Math.random() * 100;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
```

### Idempotency keys

For mutating requests (collateral registration, loan requests, repayments) supply an
`Idempotency-Key` header. If the server receives a duplicate key within 24 hours it returns
the original response without re-executing the operation:

```http
POST /api/v1/loan/request
Idempotency-Key: loan-req-<uuid>
Content-Type: application/json
...
```

See [docs/IDEMPOTENCY.md](../IDEMPOTENCY.md) for key format requirements and TTL.

## 5. End-to-end Node.js example

The following script registers collateral, requests a loan, subscribes to lifecycle events,
and handles errors with retry logic.

```js
// integration-example.js
// Prerequisites: npm install node-fetch uuid
// Environment variables: API_BASE_URL, API_TOKEN, WEBHOOK_URL

const { randomUUID } = require("crypto");
const crypto = require("crypto");

const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const TOKEN = process.env.API_TOKEN ?? "";
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "";

// ── HTTP helper with retry ────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const { body, method = "GET", idempotencyKey } = options;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`,
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  async function attempt() {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.response = res;
      err.response.status = res.status;
      err.response.headers = Object.fromEntries(res.headers.entries());
      throw err;
    }
    return res.json();
  }

  return callWithRetry(attempt);
}

async function callWithRetry(fn, { maxAttempts = 4, baseDelayMs = 250 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status ?? 0;
      const retryable = status === 429 || (status >= 500 && status < 600);
      if (!retryable || attempt === maxAttempts) throw err;

      const retryAfter = err?.response?.headers?.["retry-after"];
      const delay = retryAfter
        ? Number(retryAfter) * 1000
        : baseDelayMs * 2 ** (attempt - 1) + Math.random() * 100;

      console.warn(`Attempt ${attempt} failed (${status}), retrying in ${Math.round(delay)}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ── Signature verification ────────────────────────────────────────────────

function isValidSignature(rawBody, signatureHeader, secret) {
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Main integration flow ─────────────────────────────────────────────────

async function main() {
  // Step 1: Register collateral
  console.log("Registering collateral...");
  const collateral = await apiFetch("/collateral/register", {
    method: "POST",
    idempotencyKey: `collateral-${randomUUID()}`,
    body: {
      owner: "GABCD...WXYZ",
      animal_type: "cattle",
      count: 5,
      appraised_value: 2500,
    },
  });
  console.log("Collateral registered:", collateral.id);

  // Step 2: Request a loan
  console.log("Requesting loan...");
  const loan = await apiFetch("/loan/request", {
    method: "POST",
    idempotencyKey: `loan-${randomUUID()}`,
    body: {
      collateral_id: collateral.id,
      borrower: "GABCD...WXYZ",
      amount: 1000,
    },
  });
  console.log("Loan requested:", loan.id, "— status:", loan.status);

  // Step 3: Subscribe to loan lifecycle events via webhook
  if (WEBHOOK_URL) {
    console.log("Subscribing to webhook events...");
    const webhook = await apiFetch("/webhooks", {
      method: "POST",
      body: {
        url: WEBHOOK_URL,
        events: ["loan.activated", "loan.repaid", "loan.liquidated"],
        encrypt: false,
      },
    });
    // Store webhook.secret in your secrets manager — it is not returned again.
    console.log("Webhook registered:", webhook.id);
    console.log(
      "IMPORTANT: Store the webhook secret securely. It will not be shown again:",
      webhook.secret
    );
  }

  console.log("Integration setup complete.");
}

main().catch((err) => {
  console.error("Integration failed:", err.message);
  process.exit(1);
});
```

## 6. Testing against the staging environment

The staging environment mirrors production data and configuration, making it the right place to
validate your integration end-to-end before going live.

**Base URL**: `https://api.staging.stellarkraal.io/api/v1`

### Obtaining staging credentials

1. Contact the StellarKraal team to request a staging API token and a test borrower keypair.
2. Use the Stellar Testnet (Futurenet is not supported on staging) for all wallet interactions.
3. Staging contracts are deployed on the Stellar Testnet and reset weekly; re-register
   collateral after each reset if your data disappears.

### Triggering loan lifecycle events manually

You can accelerate the loan state machine on staging to test webhook deliveries without waiting
for real-world approval or repayment windows:

```http
POST /api/v1/staging/loan/:id/advance
Content-Type: application/json
Authorization: Bearer <staging-token>

{ "to": "repaid" }
```

Allowed target states: `activated`, `repaid`, `liquidated`. This endpoint is not available in
production.

### Inspecting webhook delivery logs

After advancing a loan, verify your endpoint received the event:

```http
GET /api/v1/admin/webhooks/logs?webhookId=<wh_id>&limit=10
Authorization: Bearer <staging-token>
```

Each log entry shows the HTTP status your endpoint returned, the delivery latency, and whether
the attempt will be retried.

### Checking the staging health endpoint

```http
GET /api/v1/status
```

Returns `{ "status": "ok", "environment": "staging" }` when the service is healthy. If this
returns a non-200 response, the staging environment may be in the middle of its weekly reset.

## Summary

1. `POST /api/v1/collateral/register` — register livestock as collateral.
2. `POST /api/v1/loan/request` — request a loan against that collateral.
3. `POST /api/v1/webhooks` — subscribe once to receive `loan.activated` / `loan.repaid` /
   `loan.liquidated` events instead of polling `GET /api/v1/loan/:id`.
4. Verify every delivery's `X-StellarKraal-Signature` before acting on it.
5. Retry only `429` and `5xx` responses, using exponential backoff with an `Idempotency-Key`
   to avoid duplicate operations.
6. Test your full flow against the staging environment before pointing at production.
