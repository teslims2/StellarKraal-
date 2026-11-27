# Event Listener Lifecycle

The contract event listener polls the Soroban RPC for on-chain events and synchronises the local database. This guide documents the full lifecycle: start/stop sequencing, how the ledger cursor is persisted and restored across restarts, the missed-event replay algorithm, the maximum look-back window and how to configure it, and links to the runbook for manually resetting the cursor.

The listener is implemented in [`backend/src/contractEventListener.ts`](../../backend/src/contractEventListener.ts).

---

## When the Listener Starts

The listener starts automatically during **server boot**, called from `backend/src/index.ts` after the database migrations have completed and the Express server is listening:

```typescript
// backend/src/index.ts (simplified)
await runDbMigrations();
server.listen(PORT, () => {
  logger.info("server_started", { port: PORT });
  startEventListener();   // ← starts the polling loop
});
```

`startEventListener()` validates that `CONTRACT_ID` is set. If it is not set, the listener logs an `event_listener_disabled` warning and returns immediately without starting — the rest of the server continues to function normally.

On successful start, the listener restores the ledger cursor from the in-memory store (see [Ledger Cursor Persistence](#ledger-cursor-persistence-and-restoration)) and emits:

```json
{
  "message": "event_listener_started",
  "eventType": "contract.event.listener_started",
  "contractId": "C...",
  "intervalMs": 5000
}
```

---

## When the Listener Stops

The listener stops as part of the **graceful shutdown** sequence triggered by `SIGTERM` or `SIGINT` (for example `docker stop`, Kubernetes pod termination, or `Ctrl+C`). The shutdown handler in `backend/src/index.ts` calls `stopContractEventListener()` before draining in-flight HTTP requests:

```typescript
// backend/src/index.ts (simplified)
process.on("SIGTERM", async () => {
  await stopContractEventListener();  // ← stops the polling loop, flushes in-flight work
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
});
```

`stopContractEventListener()` does two things:

1. Sets `isStopping = true` and clears the internal `setTimeout` timer so no new polls are scheduled.
2. Awaits `inFlightProcessing` — the promise tracking the current batch — so any events being processed at the time of shutdown are fully written to the database before the process exits.

It is safe to call `stopContractEventListener()` multiple times. A second call while no timer is active is a no-op.

On graceful stop, the listener emits:
```json
{
  "message": "event_listener_stopped",
  "eventType": "contract.event.listener_stopped",
  "contractId": "C...",
  "ledger": 12345
}
```

---

## Ledger Cursor Persistence and Restoration

The listener tracks the last successfully processed ledger in two places:

| Location | Lifetime | Purpose |
|----------|----------|---------|
| `lastLedger` module variable | Current process only | Used during a running poll cycle to build the next `startLedger` |
| `ledgerCursorTable` in `db/store.ts` | Current process only (in-memory Map) | Shared store keyed by contract ID; survives a listener restart within the same process |

Both stores are reset to `0` when the Node.js process exits.

### How the cursor is written

After each event in a batch is processed, the listener calls:

```typescript
setLedgerCursor(contractId, event.ledger);
```

The store (`ledgerCursorTable`) maps the contract ID string to the highest ledger sequence seen so far. `lastLedger` is also updated inline:

```typescript
if (event.ledger > lastLedger) {
  lastLedger = event.ledger;
}
```

### How the cursor is read on restart

When `startEventListener()` is called (including after a `stopContractEventListener()` / `startEventListener()` cycle within the same process), it reads:

```typescript
lastLedger = getLedgerCursor(contractId); // 0 if not yet set
```

A value of `0` means no events have been processed in this process lifetime and the first poll will request all historical events. A non-zero value means the listener was stopped and restarted within the same process and can resume from `lastLedger + 1`.

> **Important — process restart resets the cursor to 0.**  
> `ledgerCursorTable` is an in-memory `Map`. When the backend process exits (crash, `SIGKILL`, container restart, deployment), the cursor is lost. On the next process start `getLedgerCursor` returns `0` and the listener replays all events from the chain's genesis. This is safe because the store functions are idempotent, but it adds latency proportional to total event history. See [Missed-Event Replay Algorithm](#missed-event-replay-algorithm) and the [Ledger Cursor Reset Runbook](../runbooks/reset-ledger-cursor.md) for details.

---

## Missed-Event Replay Algorithm

The replay algorithm runs on every `startEventListener()` call. It issues a single `getEvents` request whose starting point depends on the cursor value:

```
lastLedger = getLedgerCursor(contractId)   // 0 on process restart

if lastLedger == 0:
    request = { cursor: "0", filters: [...] }   // full replay from genesis
else:
    request = { startLedger: lastLedger + 1, filters: [...] }   // incremental
```

### Full replay (cursor = 0)

Using `cursor: "0"` instructs the Soroban RPC to return events starting from the earliest available ledger. All historical events for the contract are returned in ascending ledger order. Each event is handled sequentially:

1. `handleEvent(event)` processes the event and writes to the database (upsert — idempotent).
2. `setLedgerCursor(contractId, event.ledger)` advances the cursor.
3. `lastLedger` is updated.

After the batch, `setTimeout(tick, intervalMs)` schedules the next poll.

### Incremental replay (cursor > 0)

After the first poll cycle, or after a stop/start within the same process, the listener issues `getEvents` with `startLedger: lastLedger + 1`. Only events at or after that ledger are returned, so the listener catches up from exactly where it left off.

### Sequence diagram

```mermaid
sequenceDiagram
    participant Process as Backend Process
    participant Listener as Event Listener
    participant Store as ledgerCursorTable
    participant RPC as Soroban RPC
    participant DB as SQLite / PostgreSQL

    Process->>Listener: startEventListener()
    Listener->>Store: getLedgerCursor(contractId)
    Store-->>Listener: lastLedger (0 on first start after process restart)

    alt lastLedger == 0 (full replay)
        Listener->>RPC: getEvents({ cursor: "0", filters })
    else lastLedger > 0 (incremental)
        Listener->>RPC: getEvents({ startLedger: lastLedger + 1, filters })
    end

    RPC-->>Listener: batch of events [e1, e2, ..., eN]

    loop for each event eK in batch
        Listener->>DB: handleEvent(eK) → insertCollateral / insertLoan / updateTransaction …
        DB-->>Listener: ok (upsert — safe to replay)
        Listener->>Store: setLedgerCursor(contractId, eK.ledger)
        Listener->>Listener: lastLedger = eK.ledger
    end

    Listener->>Listener: setTimeout(tick, intervalMs)

    note over Process,DB: On SIGTERM
    Process->>Listener: stopContractEventListener()
    Listener->>Listener: clearTimeout(pollTimer); isStopping = true
    Listener->>Listener: await inFlightProcessing (flush current batch)
    Listener-->>Process: resolved
```

### Idempotency guarantee

Every database write that the listener makes goes through an upsert path:

- `insertCollateral` — `INSERT OR REPLACE` keyed on collateral ID.
- `insertLoan` — `INSERT OR REPLACE` keyed on loan ID.
- `updateTransaction` — `UPDATE … WHERE id = ?` (no-op if already in the target state).
- `insertLiquidationEvent` — `INSERT OR IGNORE` keyed on loan ID.

Replaying the same event twice produces the same final database state. No duplicates are created.

---

## Maximum Look-Back Window

The Soroban RPC limits how far back `getEvents` can look. This is not a backend configuration — it is enforced by the RPC node.

| Network | Approximate look-back window | Notes |
|---------|------------------------------|-------|
| Testnet | ~17,280 ledgers (~24 hours) | Testnet nodes prune events aggressively |
| Mainnet | ~172,800 ledgers (~10 days) | Dependent on the RPC provider's retention policy |

A Stellar ledger closes approximately every 5 seconds, so:
- 17,280 ledgers ≈ 86,400 seconds ≈ 24 hours
- 172,800 ledgers ≈ 864,000 seconds ≈ 10 days

If the backend is offline longer than the RPC's retention window, `getEvents` with `cursor: "0"` will start from the oldest available ledger — not from genesis. Events emitted before the retention window are permanently unavailable from the RPC and will not be replayed. The database will be missing those events until they are manually reconciled.

### Configuring the effective look-back

The backend does not set an explicit look-back limit; it always requests events from `lastLedger + 1` (or from `cursor: "0"`). To control how much history is replayed on a forced reset, set `lastLedger` to a recent ledger sequence before restarting — see the [Ledger Cursor Reset Runbook](../runbooks/reset-ledger-cursor.md).

| Environment variable | Default | Description |
|---------------------|---------|-------------|
| `EVENT_POLL_INTERVAL_MS` | `5000` | Milliseconds between poll cycles |
| `EVENT_LISTENER_LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |

There is no `EVENT_LOOK_BACK_LEDGERS` variable. The replay window is bounded entirely by the RPC node's retention policy and the value of `lastLedger` at startup.

---

## Polling Interval Configuration

The listener runs a `setTimeout`-based loop (not `setInterval`) so each poll waits for the previous one to complete before scheduling the next. This prevents RPC calls from piling up if the network is slow.

The interval can be overridden at startup:

```typescript
startEventListener(10_000); // poll every 10 seconds
```

Or via environment variable before starting the server:

```bash
EVENT_POLL_INTERVAL_MS=10000 npm start
```

**Recommendations:**

- **Testnet / development**: `5000 ms` (default) — low latency, acceptable RPC load.
- **Production mainnet**: `10000–30000 ms` — reduces RPC costs while still catching events within one ledger close (~5 s per ledger).
- **After a long outage / restart with full replay**: temporarily increase to `30000 ms` to throttle event ingestion and avoid memory pressure.

---

## Full Startup-to-Shutdown Sequence

```
Backend process start
│
├─ runDbMigrations()              — apply any pending DB migrations
├─ server.listen(PORT)            — begin accepting HTTP connections
└─ startEventListener()
      │
      ├─ getLedgerCursor(contractId) → lastLedger (0 on fresh start)
      └─ tick()
            │
            ├─ poll()
            │     ├─ lastLedger == 0 → getEvents({ cursor: "0", filters })
            │     └─ lastLedger > 0  → getEvents({ startLedger: lastLedger+1, filters })
            │
            ├─ handleEvent(e1)    — DB upsert; setLedgerCursor; lastLedger = e1.ledger
            ├─ handleEvent(e2)    — …
            ├─ handleEvent(eN)    — lastLedger = eN.ledger
            └─ setTimeout(tick, intervalMs)
                  │
                  └─ ... repeats ...

SIGTERM / SIGINT received
│
├─ stopContractEventListener()
│     ├─ isStopping = true
│     ├─ clearTimeout(pollTimer)
│     └─ await inFlightProcessing   — flush current batch before returning
│
├─ server.close()                 — stop accepting new connections
├─ drain in-flight HTTP requests  — wait up to SHUTDOWN_TIMEOUT_MS
└─ process.exit(0)
```

---

## Error Handling

| Error type | Behaviour |
|-----------|-----------|
| RPC network error | Logged as `contract.event.poll_error`; listener schedules next poll normally (does not crash) |
| Event parse error | Logged as `contract.event.parse_error`; the failing event is skipped; listener continues |
| `CONTRACT_ID` unset | `startEventListener()` logs `event_listener_disabled` and returns; listener never starts |
| `stopContractEventListener()` called twice | No-op; safe |

The listener never throws to the caller. All errors are caught internally and logged as structured entries.

---

## Manual Control (Development / Testing)

The listener can be started and stopped programmatically without a full server restart:

```typescript
import { startEventListener, stopContractEventListener } from './contractEventListener';

// Start with a custom interval
startEventListener(2000);

// Stop (e.g. in test teardown)
await stopContractEventListener();
```

In tests, `stopContractEventListener()` is called in `afterEach`/`afterAll` to prevent timer leaks between test cases.

---

## Related

- [Ledger Cursor Reset Runbook](../runbooks/reset-ledger-cursor.md) — manually reset the cursor when replay from a specific ledger is needed
- [`contractEventListener.ts`](../../backend/src/contractEventListener.ts) — source code
- [`contractEventListener.test.ts`](../../backend/src/contractEventListener.test.ts) — unit tests
- [Contract Event Listener Architecture](contract-event-listener.md) — polling architecture, event types, and DB sync details
- [Observability Stack](../observability.md) — how listener logs flow to Loki/Grafana
- [High Memory Runbook](../runbooks/high-memory.md) — diagnosing memory growth caused by event replay
