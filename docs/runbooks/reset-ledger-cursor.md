# Runbook: Reset the Ledger Cursor

## Purpose

Use this runbook when you need to force the contract event listener to replay events from a specific ledger rather than from where it last left off. Common triggers:

- The backend was offline longer than the RPC's retention window and you want to replay from the oldest available ledger.
- The database was restored from a backup and the in-memory cursor is ahead of the restored state.
- Events were silently dropped due to a parse bug and you need to re-ingest a specific ledger range.
- You are setting up a new environment and want a clean, full replay.

---

## Background

The listener tracks its position in the event stream through two in-memory stores:

- **`lastLedger`** — a module-level variable in `contractEventListener.ts` that holds the highest ledger sequence processed in the current process.
- **`ledgerCursorTable`** — a `Map<string, number>` in `db/store.ts`, keyed by contract ID. `setLedgerCursor` writes to it; `getLedgerCursor` reads from it on `startEventListener`.

Both stores are **in-memory only**. They reset to `0` whenever the backend process restarts. A process restart therefore automatically triggers a full replay from the oldest available ledger (`cursor: "0"`).

There is currently no database-backed cursor row to edit directly. The reset procedures below work by controlling what value `getLedgerCursor` returns when `startEventListener` runs.

---

## Procedure A — Full Replay From the Oldest Available Ledger

This is the simplest reset. It replays every event the RPC still holds (up to the node's retention window — approximately 24 hours on testnet, 10 days on mainnet).

**When to use:** the database was wiped or restored to an earlier state, or you want the most complete replay the RPC can provide.

### Steps

1. **Stop the backend gracefully** so the in-flight batch is flushed cleanly:

   ```bash
   # Docker Compose
   docker compose stop backend

   # Systemd
   systemctl stop stellarkraal-backend

   # Kubernetes
   kubectl rollout restart deployment/stellarkraal-backend
   ```

2. **Start the backend.** On startup `getLedgerCursor` returns `0` (the Map is empty), so the listener issues `getEvents({ cursor: "0", ... })` and replays all available history.

   ```bash
   docker compose start backend
   # or
   systemctl start stellarkraal-backend
   ```

3. **Monitor the replay** in the logs. Look for `contract.event.received` entries at high frequency. The replay is complete when the log rate drops back to one entry per poll interval.

   ```bash
   # Structured logs via Docker
   docker compose logs -f backend | grep '"eventType":"contract.event.received"'

   # Loki / Grafana Explore
   {service="backend"} |= "contract.event.received" | json
   ```

4. **Verify catch-up.** Compare the `ledger` field in recent log entries against the current ledger from the RPC:

   ```bash
   curl -s -X POST $RPC_URL \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' \
     | jq '.result.sequence'
   ```

   The gap between `lastLedger` in the logs and the latest ledger sequence should shrink to the width of one or two poll cycles.

---

## Procedure B — Partial Replay From a Specific Ledger

Use this when you know exactly which ledger range needs to be re-ingested — for example after a targeted database repair.

**When to use:** a known range of events (say ledgers 5,000,000–5,100,000) was not processed correctly and needs to be replayed without re-running the full history.

### Steps

1. **Identify the target start ledger.** This is the ledger *before* the range you want to replay — the listener will request `startLedger: target + 1` on its next poll. For example, to replay from ledger 5,000,000, set the cursor to `4,999,999`.

2. **Stop the backend** (same commands as Procedure A, step 1).

3. **Write a one-off script** to seed the in-memory store before starting the listener. Because the cursor is in-memory only, the most reliable way to do this for a production process is to modify startup code temporarily:

   ```typescript
   // backend/src/index.ts — temporary, revert after the replay completes
   import { setLedgerCursor } from "./db/store";

   // Seed the cursor before starting the listener
   setLedgerCursor(process.env.CONTRACT_ID!, 4_999_999);
   startEventListener();
   ```

   Alternatively, you can call `setLedgerCursor` directly from a one-off Node.js script that imports the store module and then exits, allowing the main process to pick up the value — but only if both run in the same process context. Because the Map is not shared across processes, the simplest production path is the temporary startup-code approach above.

4. **Start the backend.** On the first poll cycle the listener will call `getLedgerCursor`, receive `4,999,999`, and issue `getEvents({ startLedger: 5,000,000, ... })`.

5. **Revert the temporary code** once the replay window has been processed and the listener is again running in its normal incremental mode.

6. **Monitor and verify** as in Procedure A, steps 3–4.

---

## Procedure C — Throttled Replay After a Long Outage

If the backend was offline for a significant period (hours to days), the first poll after restart will return a large batch of events. This can cause high memory usage while the batch is being processed. Use this procedure to replay at a controlled pace.

### Steps

1. **Stop the backend** (same commands as Procedure A, step 1).

2. **Set a higher poll interval** to reduce the size of each incremental batch:

   ```bash
   # In your .env or environment config
   EVENT_POLL_INTERVAL_MS=30000
   ```

3. **Start the backend.** The larger interval means each catch-up poll covers a smaller ledger range, keeping memory usage manageable.

4. **Monitor the lag** (gap between `lastLedger` and the chain head). Once the lag is within one or two intervals, restore the original poll interval:

   ```bash
   EVENT_POLL_INTERVAL_MS=5000
   ```

   Then restart the backend for the change to take effect.

---

## Verifying the Reset Completed

After any procedure, confirm the listener is running in normal incremental mode:

1. **Check the startup log** for the `event_listener_started` entry and note `intervalMs`.

2. **Tail the event log** and confirm the `ledger` values in `contract.event.received` entries are advancing toward the current chain head.

3. **Check database row counts** match your expectations:

   ```sql
   -- SQLite (local dev)
   SELECT COUNT(*) FROM collaterals;
   SELECT COUNT(*) FROM loans;
   SELECT COUNT(*) FROM transactions;
   ```

4. **Run the reconciliation query** (if available) to compare on-chain state against the database.

---

## Rollback

If the replay produces unexpected data or the cursor was set incorrectly:

1. Stop the backend.
2. Restore the database from the most recent backup ([Database Restore Runbook](database-restore.md)).
3. Start the backend and allow a fresh full replay (Procedure A).

---

## Escalation

If the replay does not complete within 30 minutes, or if `contract.event.poll_error` entries appear repeatedly:

1. Check RPC node health — see the [RPC Failure Runbook](rpc-failure.md).
2. Confirm `CONTRACT_ID` and `RPC_URL` are set correctly in the environment.
3. If events older than the RPC retention window are needed, they must be sourced from an archive node or a database backup that pre-dates the gap.
4. Page the **Backend Engineering on-call** via `#incidents` on Slack with the output of:
   ```bash
   docker compose logs --tail=200 backend | grep '"eventType":"contract.event'
   ```

---

## Related

- [Event Listener Lifecycle](../guides/event-listener-lifecycle.md) — cursor persistence, replay algorithm, and look-back window details
- [Contract Event Listener Architecture](../guides/contract-event-listener.md) — polling architecture and event types
- [Database Restore Runbook](database-restore.md) — restoring the database from backup
- [RPC Failure Runbook](rpc-failure.md) — diagnosing RPC connectivity issues
- [High Memory Runbook](high-memory.md) — handling memory pressure during large replays
- [`backend/src/contractEventListener.ts`](../../backend/src/contractEventListener.ts) — source code
- [`backend/src/db/store.ts`](../../backend/src/db/store.ts) — `getLedgerCursor` / `setLedgerCursor`
