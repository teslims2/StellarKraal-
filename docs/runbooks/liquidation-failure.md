# Runbook: Liquidation Engine Failure

> **Severity:** P1 — immediate action required.  
> **Closes:** #1298  
> **Related docs:** [Liquidation Mechanism](../protocol/liquidation.md) · [On-Call Rotation](../ON_CALL_ROTATION.md) · [RPC Failure Runbook](rpc-failure.md)

---

## 1. Incident Description

The automated liquidation job (`backend/src/jobs/liquidationJob.ts`) periodically scans for undercollateralised loans (health factor < 10 000) and invokes the `liquidate()` Soroban contract function. When this job fails silently or persistently, underwater positions accumulate without being closed, creating systemic bad-debt risk to the protocol.

**Common failure modes:**

| Mode | Typical symptom |
|---|---|
| Wallet balance exhausted | `tx_insufficient_balance` in logs |
| Sequence number desync | `tx_bad_seq` in logs; job restarts may fix it |
| RPC connectivity lost | `ECONNREFUSED` or `fetch failed` in logs |
| Contract invocation error | `HostError` / contract error code in logs |
| Job process crash | No `LiquidationJobHeartbeat` log entries |
| Database read failure | `SQLITE_BUSY` or `no such column` in logs |

---

## 2. Alert Triggers

The following Prometheus/Grafana alert rules are defined in
`observability/prometheus-rules.yml` and fire into the `#alerts` Slack channel:

| Alert | Condition | Meaning |
|---|---|---|
| `LiquidationEngineStalled` | No successful liquidation run in the last 2× job interval | Job may have crashed or is not being scheduled |
| `LiquidationTxFailed` | `liquidation_tx_error_total` counter increases | A liquidation transaction was submitted but rejected by the network or contract |
| `UnderwaterLoansAccumulating` | `loans_at_risk_count` > threshold without a corresponding `liquidation_success_total` increase | Positions are building up without being closed |

**Grafana links (staging):**  
`http://localhost:3200/alerting` → filter by rule name above.  
LogQL to surface liquidation errors:

```logql
{service="backend"} |= "liquidation" |= "error"
```

---

## 3. Impact Assessment

| Dimension | Impact |
|---|---|
| **Criticality** | P1 — bad debt accumulates while the engine is down |
| **User impact** | Borrowers with HF < 1.0 should be liquidated but are not; protocol solvency degrades |
| **Time sensitivity** | Every minute of delay allows collateral values to fall further |
| **Reversibility** | All liquidations are on-chain and permanent; do not liquidate a healthy loan |

---

## 4. Detection & Triage

### 4.1 Confirm the job is failing

```bash
# Tail recent backend logs
docker compose logs --tail=200 backend | grep -iE "liquidat|error|warn"

# Or via Grafana → Explore → Loki
{service="backend"} |= "liquidat" | last 30m
```

Look for:
- `Liquidation job error:` — job-level crash
- `tx_bad_seq` — sequence number mismatch
- `tx_insufficient_balance` — wallet needs funding
- `HostError` / `Error::HealthFactorSafe` — contract-level rejection

### 4.2 Check how many loans are underwater

Run the following diagnostic query against the backend database:

```bash
# Connect to the SQLite database (local / staging)
sqlite3 backend/kraal.db \
  "SELECT id, borrower, amount, status FROM loans WHERE status = 'active' ORDER BY amount DESC LIMIT 20;"

# Count at-risk positions
sqlite3 backend/kraal.db \
  "SELECT COUNT(*) AS at_risk FROM loans WHERE status = 'at_risk';"
```

For production (PostgreSQL via RDS):

```bash
psql "$DATABASE_URL" -c \
  "SELECT id, borrower, amount, status FROM loans WHERE status IN ('active','at_risk') ORDER BY amount DESC LIMIT 20;"
```

### 4.3 Verify the liquidation wallet balance

```bash
# Stellar CLI (testnet/mainnet — adjust --network)
stellar account info \
  --network testnet \
  "$LIQUIDATION_WALLET_PUBKEY"
```

A balance of less than **~1 XLM** (enough for ~100 transactions) is a warning; less than **0.1 XLM** will cause `tx_insufficient_balance` failures. Fund the wallet before retrying (see §5.1).

### 4.4 Check RPC connectivity

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  "$RPC_URL"
```

Expected: `{"result":{"status":"healthy"}}`. If the RPC is down, follow the [RPC Failure Runbook](rpc-failure.md) first — the liquidation engine cannot operate without it.

### 4.5 Check sequence number sync

```bash
stellar account info --network testnet "$LIQUIDATION_WALLET_PUBKEY" \
  | grep -i sequence
```

Compare against the sequence the backend last used (logged at job startup). If they differ by more than 1, the backend's local sequence cache is stale — restart the service (§5.2).

---

## 5. Remediation Steps

Work through these steps in order. Stop when the job is running successfully.

### 5.1 Fund the liquidation wallet (if balance exhausted)

1. Obtain the staging/production liquidation wallet public key from the `LIQUIDATION_WALLET_PUBKEY` environment variable (see `.env.example`).
2. Transfer at minimum **10 XLM** (50 XLM recommended for production):

   ```bash
   # Using Stellar CLI (testnet)
   stellar transfer \
     --network testnet \
     --source "$FUNDER_ACCOUNT_SECRET" \
     --destination "$LIQUIDATION_WALLET_PUBKEY" \
     --amount 50 \
     --asset native
   ```

3. Verify the new balance and restart the backend service.

### 5.2 Restart the backend service (sequence number / crash recovery)

```bash
# Docker Compose (local / staging)
docker compose restart backend

# ECS (staging / production) — replace CLUSTER and SERVICE with actual values
aws ecs update-service \
  --cluster stellarkraal-staging \
  --service backend \
  --force-new-deployment
```

Wait ~30 seconds, then verify the job heartbeat resumes:

```bash
docker compose logs --tail=50 backend | grep -i "liquidation job"
```

### 5.3 Manual liquidation via admin endpoint

If the automated job cannot be restored quickly and loans remain underwater, use the admin endpoint to trigger liquidations individually. This requires an admin JWT token.

**⚠️ Check health factor before calling — do NOT liquidate a healthy loan.**

```bash
# 1. Obtain an admin JWT (staging example)
TOKEN=$(curl -sX POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"address":"'"$ADMIN_STELLAR_ADDRESS"'","signature":"'"$ADMIN_SIGNATURE"'"}' \
  | jq -r '.token')

# 2. Trigger liquidation for a specific loan ID
curl -sX POST http://localhost:3001/api/admin/liquidations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"loanId": "<LOAN_ID>"}' | jq .
```

Expected success response: `{"success": true, "txHash": "..."}`.

Verify on-chain:

```bash
stellar transaction get --network testnet --id "<TX_HASH>"
```

Repeat for each underwater loan found in §4.2. Log each manual action in the `#incidents` Slack channel with loan ID and tx hash.

### 5.4 Soroban CLI fallback (direct contract invocation)

If the backend API is entirely unavailable, invoke the contract directly:

```bash
stellar contract invoke \
  --network testnet \
  --id "$CONTRACT_ID" \
  --source "$LIQUIDATION_WALLET_SECRET" \
  -- liquidate \
  --loan_id "<LOAN_ID>" \
  --liquidator "$LIQUIDATION_WALLET_PUBKEY"
```

See the [Smart Contract Interface](../contracts/stellarkraal-interface.md#liquidate) for full parameter documentation.

### 5.5 Rollback to a previous backend image

If a recent deployment introduced a regression in the liquidation job:

1. Identify the last known-good image tag from the container registry (GitHub Container Registry or ECR).

   ```bash
   # List recent image tags
   aws ecr describe-images \
     --repository-name stellarkraal-backend \
     --query 'sort_by(imageDetails, &imagePushedAt)[-5:].imageTags' \
     --output table
   ```

2. Deploy the previous image:

   ```bash
   # ECS rollback
   aws ecs update-service \
     --cluster stellarkraal-staging \
     --service backend \
     --task-definition "stellarkraal-backend:<PREVIOUS_REVISION>"
   ```

3. Verify the liquidation job is healthy before opening a fix PR.

4. Document the regression in the post-mortem (§7).

---

## 6. Escalation Path

| Step | Who | When | How |
|---|---|---|---|
| **L1** | On-call primary (see [ON_CALL_ROTATION.md](../ON_CALL_ROTATION.md)) | Immediately on alert | Follow this runbook |
| **L2** | On-call secondary | Primary cannot resolve within **30 min** or is unreachable | Page via PagerDuty or Slack DM |
| **L3** | Smart Contract / Blockchain Engineering Lead | Contract-level error or unknown HostError — escalate immediately | Slack `#backend-eng` + direct message |
| **L4** | Engineering Manager + Product Manager | Protocol solvency risk — bad debt > $500 equivalent | Immediate notification; consider pausing new loan creation |

**On-call contacts:** See [ON_CALL_ROTATION.md](../ON_CALL_ROTATION.md) for the current week's primary and secondary engineers with Slack handles and emergency phone numbers.

**Communication during incident:**
- Post an initial status update in `#incidents` within **5 minutes** of acknowledging the alert.
- Update `#incidents` every **15 minutes** while the incident is active.
- Notify `#product` if liquidations are delayed by more than **30 minutes**.
- Update the [status page](https://status.stellarkraal.io) if the outage is user-facing.

---

## 7. Post-Incident Review

### 7.1 Required for all P1 incidents

File a GitHub issue using the [post-mortem template](#72-post-mortem-template) within **48 hours** of resolution. Tag it with `incident`, `post-mortem`, and `liquidation`.

Minimum required sections:
- Timeline of events (UTC timestamps)
- Root cause (5 Whys or Fishbone)
- Impact (loans affected, duration)
- What went well
- Action items with owners and due dates (tracked in GitHub issues)

### 7.2 Post-Mortem Template

```markdown
## Post-Mortem: Liquidation Engine Failure — [DATE]

**Severity:** P1
**Duration:** [START UTC] → [END UTC] (total: X h Y min)
**Responders:** [List names / handles]

---

### Summary
[1-3 sentences describing what failed and the impact]

### Timeline (all times UTC)

| Time | Event |
|------|-------|
| HH:MM | Alert fired: LiquidationEngineStalled |
| HH:MM | On-call acknowledged |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Job resumed normal operation |
| HH:MM | Incident resolved |

### Root Cause
[Detailed technical explanation]

### Impact
- Loans left underwater without liquidation: N
- Maximum duration without automated liquidation: X min
- Protocol bad-debt exposure during incident: [estimate in XLM]

### What Went Well
- [e.g. alert fired within 2 minutes of job stalling]

### What Could Be Improved
- [e.g. wallet balance monitoring alert threshold too low]

### Action Items

| Action | Owner | Due date | GitHub issue |
|--------|-------|----------|--------------|
| [Description] | @handle | YYYY-MM-DD | #NNN |

### Reviewed by
- [ ] On-call engineer
- [ ] Engineering Manager
- [ ] Smart Contract Lead
```

---

## 8. Prevention Checklist

After resolving the incident, verify the following:

- [ ] Liquidation wallet balance alert threshold set to > 5 XLM (`observability/prometheus-rules.yml`)
- [ ] `LiquidationEngineStalled` alert window is ≤ 2× the job interval
- [ ] Job scheduler has a process supervisor (e.g. ECS restart policy or `restart: unless-stopped` in Compose)
- [ ] RPC circuit-breaker retry logic is tested in `backend/src/jobs/liquidationJob.ts`
- [ ] Manual liquidation admin endpoint is documented in [admin-routes.md](../development/admin-routes.md)
- [ ] Post-mortem action items are converted to GitHub issues with assignees and milestones
- [ ] Rotation table in [ON_CALL_ROTATION.md](../ON_CALL_ROTATION.md) is populated with real contacts

---

*Last updated: 2026-09-26 · Reviewed by: on-call rotation (pending production deployment)*
