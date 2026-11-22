# Graceful Shutdown

This document explains how the StellarKraal backend shuts down cleanly on
`SIGTERM` or `SIGINT`, how `SHUTDOWN_TIMEOUT_MS` controls the drain window,
and how to test the behaviour in development.

---

## Why graceful shutdown matters

The backend handles:
- **In-flight HTTP requests** that may be in the middle of writing to PostgreSQL
  or submitting a Soroban transaction.
- **A background health-factor job** (`cron`) that polls on-chain collateral
  values and fires alerts.
- **A database connection pool** that must be drained before the process exits
  to avoid orphaned connections or incomplete writes.

Killing the process with `SIGKILL` or `kill -9` skips all of this and can
leave the database in an inconsistent state. Graceful shutdown gives all three
a chance to finish cleanly.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Maximum milliseconds to wait for in-flight requests to drain before the process is force-exited with code 1. Minimum value is 1000. |

Set this in `.env` (or as a Docker / ECS environment variable):

```bash
SHUTDOWN_TIMEOUT_MS=15000   # 15 seconds for a busier deployment
```

---

## Shutdown sequence

When the process receives `SIGTERM` or `SIGINT`, the following steps execute
**in order**:

```
SIGTERM / SIGINT received
│
├─ 1. Set isShuttingDown = true
│      The shutdownGuard middleware begins returning 503 to all new requests.
│
├─ 2. httpServer.close()
│      Node.js stops accepting new TCP connections.
│      httpServer.closeAllConnections() forcibly closes idle keep-alive sockets
│      so the server does not wait indefinitely for them to time out.
│
├─ 3. Wait for in-flight requests (poll every 1 s)
│      The draining middleware tracks each request with
│      incrementInFlightRequests() on entry and decrementInFlightRequests()
│      on response finish. The shutdown manager polls until the counter
│      reaches 0 or SHUTDOWN_TIMEOUT_MS elapses (→ force exit, code 1).
│
├─ 4. pool.close()
│      The RPC connection pool is closed after all requests have completed,
│      so no in-flight Soroban call loses its connection mid-flight.
│
├─ 5. healthFactorTask.stop()
│      The cron-based health-factor background job is stopped. This is a
│      soft stop — the job will not start another tick, but any currently
│      running tick completes naturally before the process exits.
│
├─ 6. onShutdownComplete() (optional hook)
│      An optional async callback registered at startup. Currently unused
│      in the default configuration but available for custom cleanup (e.g.
│      flushing a metrics buffer or closing a third-party SDK client).
│
└─ 7. process.exit(0)
       Clean exit. If any step in 3–6 throws, the process exits with code 1
       and logs the error.
```

### Force-exit timer

A `setTimeout` is armed at the start of step 1. If `SHUTDOWN_TIMEOUT_MS`
elapses before all in-flight requests drain (step 3), the timer fires and
calls `process.exit(1)`. This ensures the process always terminates even if a
request handler is stuck.

---

## What happens when SHUTDOWN_TIMEOUT_MS expires

If requests are still in flight when the timeout elapses:

1. The force-exit timer fires.
2. The backend logs an error:
   ```
   Graceful shutdown timeout exceeded, forcing exit  { timeoutMs: 10000, inFlightRequests: 2 }
   ```
3. `process.exit(1)` is called immediately — the remaining requests are
   abandoned and their database writes may be incomplete.
4. Any container orchestrator (ECS, Docker Compose, Kubernetes) that monitors
   the process exit code will see a non-zero exit and may trigger a restart or
   alert.

To reduce forced exits in production, increase `SHUTDOWN_TIMEOUT_MS` to match
your 95th-percentile request latency plus a margin (e.g. if P95 is 3 s, set
`SHUTDOWN_TIMEOUT_MS=8000`).

---

## How in-flight request tracking works

Two Express middlewares collaborate on request counting:

| Middleware | File | Responsibility |
|---|---|---|
| `requestDrainingMiddleware` | `middleware/requestDraining.ts` | Calls `incrementInFlightRequests()` on every incoming request and `decrementInFlightRequests()` when the response closes. |
| `shutdownGuardMiddleware` | `middleware/shutdownGuard.ts` | Checks `isServerShuttingDown()` on every request. Returns `503 Service Unavailable` if shutdown has started, so no new work enters the system while draining. |

Both middlewares are registered before all route handlers in `index.ts`, so
they cover every request including health checks and admin routes.

---

## How the event listener is stopped cleanly

The health-factor background job (`healthFactorTask`) runs on a cron schedule
using [`node-cron`](https://www.npmjs.com/package/node-cron). Stopping it at
shutdown step 5 (`healthFactorTask.stop()`) tells `node-cron` not to schedule
the next execution. Any tick that is already in progress continues until it
returns — the cron library does not interrupt a running callback. Because the
tick is a pure read operation (fetch on-chain price → compute health factor →
write alert if needed), partial execution does not corrupt state.

If the job is in the middle of a Soroban RPC call when shutdown begins, that
call will complete (or time out according to `TIMEOUT_CONTRACT_MS`) before the
process exits, as long as `SHUTDOWN_TIMEOUT_MS` is long enough.

---

## Uncaught errors and unhandled rejections

The signal handlers also cover process-level errors:

```
process.on('uncaughtException', …)
process.on('unhandledRejection', …)
```

Both are treated as signals and trigger the same graceful shutdown sequence.
The error is logged before shutdown begins so it appears in structured logs and
is shipped to Loki.

---

## Testing graceful shutdown in development

### Manual test with curl

1. Start the backend (outside Docker for easier observation):
   ```bash
   cd backend
   npm run dev
   ```
2. Send a slow request to keep an in-flight request open (the timeout endpoint
   sleeps for the duration you specify):
   ```bash
   # In one terminal — holds a request open for 5 seconds
   curl -s "http://localhost:3001/api/v1/debug/slow?ms=5000"
   ```
3. In a second terminal, send `SIGTERM` to the backend process:
   ```bash
   kill -SIGTERM $(lsof -ti :3001)
   ```
4. Observe the backend logs. You should see:
   ```
   Received SIGTERM, initiating graceful shutdown
   Waiting for in-flight requests to complete  { inFlightRequests: 1, elapsedMs: 1000, … }
   All in-flight requests completed
   Database connection pool closed
   Health factor job stopped
   Graceful shutdown complete
   ```
   The `curl` command will complete with its response before the server exits.

### Test the force-exit path

Set a short timeout so it fires before the slow request finishes:

```bash
SHUTDOWN_TIMEOUT_MS=2000 npm run dev
```

Then repeat the curl test with a 5 s slow request. After 2 s the backend will log:

```
Graceful shutdown timeout exceeded, forcing exit  { timeoutMs: 2000, inFlightRequests: 1 }
```

and the curl command will receive a connection reset.

### Docker Compose test

```bash
# Start the stack
docker compose up --build -d

# Inspect the shutdown timeout currently configured
docker compose exec backend printenv SHUTDOWN_TIMEOUT_MS

# Send SIGTERM to the backend container (Docker sends SIGTERM on `stop`)
docker compose stop backend

# View the shutdown log sequence
docker compose logs backend --tail 20
```

Docker's default stop timeout is 10 s — it sends `SIGTERM`, waits 10 s, then
sends `SIGKILL`. If `SHUTDOWN_TIMEOUT_MS` is larger than Docker's stop timeout,
the process will be killed before it can drain. Keep `SHUTDOWN_TIMEOUT_MS` at
least 2–3 s shorter than the Docker stop timeout:

```bash
# Raise Docker's stop timeout to 20 s to give the backend 15 s to drain
docker compose stop --timeout 20 backend
```

Or set `stop_grace_period` in `docker-compose.yml`:

```yaml
services:
  backend:
    stop_grace_period: 20s
```

---

## See also

- `backend/src/utils/gracefulShutdown.ts` — shutdown manager implementation
- `backend/src/middleware/shutdownGuard.ts` — 503 guard middleware
- `backend/src/middleware/requestDraining.ts` — in-flight request counter
- [Environment variables reference](../guides/environment-variables.md) — full list of `SHUTDOWN_TIMEOUT_MS` and related settings
- [Observability](../observability.md) — structured log format and Grafana dashboards
