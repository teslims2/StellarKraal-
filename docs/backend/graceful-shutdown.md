# Graceful Shutdown

The backend shuts down cleanly on `SIGTERM` and `SIGINT`, draining in-flight
HTTP requests before closing database connections and stopping background jobs.
This document explains the shutdown sequence, the `SHUTDOWN_TIMEOUT_MS`
configuration, how the event listener stops, and how to test the behaviour
locally.

---

## Shutdown Sequence

When the process receives `SIGTERM` or `SIGINT`, `registerSignalHandlers` in
`backend/src/utils/gracefulShutdown.ts` runs the following steps in order:

| Step | What happens |
|------|-------------|
| 1 | `isShuttingDown` flag is set to `true`. The `shutdownGuardMiddleware` starts rejecting new requests with `503 Service Unavailable`. |
| 2 | `httpServer.close()` is called. The server stops accepting new TCP connections immediately. |
| 3 | `httpServer.closeAllConnections()` closes idle keep-alive connections (Node ≥ 18). |
| 4 | The process polls `inFlightRequests` every second until it reaches zero or `SHUTDOWN_TIMEOUT_MS` elapses. |
| 5 | `pool.close()` drains the database connection pool. |
| 6 | `healthFactorTask.stop()` cancels the background health-factor polling job. |
| 7 | Any custom `onShutdownComplete` hooks run (used by tests). |
| 8 | `process.exit(0)` — clean exit. |

If any step throws, or if the timeout fires before in-flight requests drain,
the process calls `process.exit(1)`.

---

## SHUTDOWN_TIMEOUT_MS

`SHUTDOWN_TIMEOUT_MS` controls how long (in milliseconds) the server waits for
in-flight requests to complete before forcing an exit.

| Setting | Behaviour |
|---------|-----------|
| Default | `10000` (10 seconds) |
| Minimum | `1000` (enforced by Zod at startup) |
| Configured in | `.env` / environment variable |

### What happens when the timeout expires

If in-flight requests have not drained within `SHUTDOWN_TIMEOUT_MS`:

1. The force-shutdown timer fires.
2. The process logs `Graceful shutdown timeout exceeded, forcing exit` with the
   number of still-active requests.
3. `process.exit(1)` is called immediately.

Kubernetes and most container orchestrators treat a non-zero exit code as a
failed termination and will restart the pod. Set `SHUTDOWN_TIMEOUT_MS` to at
least the longest expected request duration plus a small buffer (e.g. if your
slowest route takes 5 s, use `8000`).

### How in-flight requests are tracked

`requestDrainingMiddleware` in `backend/src/middleware/requestDraining.ts`
increments `inFlightRequests` on every request and decrements it on `res.on('finish')`.
The counter is shared with `gracefulShutdown.ts` via the exported helpers
`incrementInFlightRequests` / `decrementInFlightRequests`.

```
Client ──► requestDrainingMiddleware (increment) ──► route handler ──► response
                                                                         │
                                                              res finish (decrement)
```

---

## Event Listener Shutdown

The contract event listener runs a polling loop started by `startEventListener()`
in `backend/src/contractEventListener.ts`. During graceful shutdown it is stopped
at step 6 by calling `healthFactorTask.stop()` (which internally calls
`stopEventListener()`).

Stopping the listener:

1. Clears the polling `setInterval`.
2. Waits for any in-progress RPC call to return (the loop checks the
   cancellation flag before processing the response).
3. Logs `event_listener_stopped`.

Because the listener is stopped **after** the HTTP server closes but **before**
database connections close, any events already fetched from the RPC are still
written to the database before the pool drains.

---

## Testing Graceful Shutdown Locally

### Unit test

```bash
cd backend
npm test -- --testPathPattern gracefulShutdown
```

### Integration test

```bash
cd backend
npm run test:integration -- --testPathPattern gracefulShutdown
```

### Manual test with Docker

```bash
# Start the backend
docker compose up backend

# In another terminal, trigger SIGTERM
docker compose kill -s SIGTERM backend

# Observe logs — expect:
#   "Received SIGTERM, initiating graceful shutdown"
#   "HTTP server closed, no longer accepting new connections"
#   "All in-flight requests completed"
#   "Database connection pool closed"
#   "Health factor job stopped"
#   "Graceful shutdown complete"
```

### Manual test without Docker

```bash
cd backend
node dist/index.js &
SERVER_PID=$!

# Send a slow request in the background
curl -s "http://localhost:3001/api/loans?page=1" &

# Immediately send SIGTERM
kill -SIGTERM $SERVER_PID

# The server should drain the curl request before exiting
```

### Verifying SHUTDOWN_TIMEOUT_MS behaviour

Set a very short timeout to observe a forced exit:

```bash
SHUTDOWN_TIMEOUT_MS=1000 node dist/index.js &
SERVER_PID=$!

# Simulate a long request that outlasts the timeout
sleep 15 &
kill -SIGTERM $SERVER_PID

# Expect "Graceful shutdown timeout exceeded" and exit code 1
```

---

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/utils/gracefulShutdown.ts` | Core shutdown logic and signal handler registration |
| `backend/src/middleware/requestDraining.ts` | Tracks in-flight request count |
| `backend/src/middleware/shutdownGuard.ts` | Returns 503 for requests arriving during shutdown |
| `backend/src/contractEventListener.ts` | Event listener (stopped during shutdown) |
| `backend/src/config.ts` | `SHUTDOWN_TIMEOUT_MS` Zod schema and default value |
| `docs/guides/event-listener-lifecycle.md` | Full event listener start/stop lifecycle |
