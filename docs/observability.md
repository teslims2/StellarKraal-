# Observability Stack

StellarKraal uses a three-pillar observability stack: **Prometheus** for
metrics, **Loki + Promtail** for logs, and **Grafana** for dashboards and
alerting. This document covers architecture, configuration, every custom
metric, and how to extend the stack.

---

## Local Observability Stack Quick-Start

This section gives you a complete, step-by-step walkthrough for spinning up the
local observability stack, importing the pre-built dashboards, and writing your
first Loki log query. If you only want reference material, skip ahead to
[Architecture](#architecture).

### 1 — Prerequisites

- [Docker](https://docs.docker.com/get-docker/) **24+** and Docker Compose
  **v2** (included with Docker Desktop).
- The repository cloned and a valid `.env` file (copy `.env.example`).

Verify Docker is running:

```bash
docker info
```

### 2 — Start the full stack

Observability services (`loki`, `promtail`, `prometheus`, `grafana`) run under
the `monitoring` Docker Compose profile so that the default `docker compose up`
stays lightweight for developers who do not need the observability stack.

Run the following from the repository root to start everything, including the
monitoring profile. The `--build` flag rebuilds backend/frontend images if you
have local code changes:

```bash
docker compose --profile monitoring up --build
```

To start only the core services without observability:

```bash
docker compose up --build
```

On first run Docker pulls the Grafana, Loki, Prometheus, and Promtail images
(~700 MB). Subsequent starts are much faster.

Expected output once everything is healthy:

```
loki_1       | level=info ts=... msg="Loki started"
promtail_1   | level=info ts=... msg="Promtail started"
prometheus_1 | level=info ts=... msg="Server is ready to receive web requests."
backend_1    | Server running on port 3001
grafana_1    | logger=http.server t=... msg="HTTP Server Listen" address=[::]:3000
```

> **Tip:** Run `docker compose --profile monitoring up -d` to start in detached
> mode and keep your terminal free.

### 3 — Verify each service

| Service | URL | Expected response |
|---------|-----|-------------------|
| **Grafana** | http://localhost:3200 | Grafana login / home page |
| **Prometheus** | http://localhost:9090 | Prometheus UI |
| **Loki** | http://localhost:3100/ready | `ready` |
| **Backend API** | http://localhost:3001/api/v1/health | `{"status":"ok"}` |
| **Backend metrics** | http://localhost:3001/metrics | Prometheus text format |

> **Authentication:** The local Grafana instance is pre-configured with
> anonymous viewer access — you can browse dashboards without logging in.
> The default admin credentials are `admin` / `admin` (you will be prompted
> to change the password on first login).

### 4 — Access Grafana and open a dashboard

1. Open http://localhost:3200 in your browser.
2. Click the **Dashboards** icon (four squares) in the left sidebar.
3. You will see two pre-provisioned dashboards:

   | Dashboard | Description |
   |-----------|-------------|
   | **StellarKraal Backend** | HTTP request rate, error rate, latency percentiles, DB pool, RPC latency |
   | **StellarKraal Logs** | Live log streams from all containers |

4. Click **StellarKraal Logs** to open the log dashboard.

> **Metric panels showing "No data"?** Confirm Prometheus is running
> (`docker compose --profile monitoring ps`) and that the backend target is
> healthy at http://localhost:9090/targets.

### 5 — Import the pre-built Grafana dashboards

The dashboards live in `grafana/dashboards/` and are auto-provisioned via the
mounted volume. To reproduce the monitoring setup in a **new environment**
(staging, production, or a fresh local clone), follow these steps.

#### 5a — Provision automatically (recommended)

Grafana reads dashboard JSON from the directory configured in
`grafana/provisioning/dashboards/dashboards.yml`. The default provider points
at `/var/lib/grafana/dashboards`, which is bind-mounted from
`grafana/dashboards/` in `docker-compose.yml`:

```yaml
# docker-compose.yml (grafana service excerpt)
services:
  grafana:
    image: grafana/grafana:10.4.2
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/var/lib/grafana/dashboards
```

```yaml
# grafana/provisioning/dashboards/dashboards.yml
apiVersion: 1
providers:
  - name: 'StellarKraal'
    orgId: 1
    folder: 'StellarKraal'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
```

To deploy to a new environment:

1. Copy `grafana/provisioning/` and `grafana/dashboards/` to the target host
   (or bake them into your image / Helm chart).
2. Mount them at the paths above.
3. Restart Grafana. Dashboards appear under the **StellarKraal** folder within
   ~30 seconds.

#### 5b — Import manually via the UI

Use this when you have a dashboard JSON file outside the provisioned directory
or want to tweak a copy without touching the repo:

1. In Grafana, click **Dashboards → Import**.
2. Click **Upload JSON file** and select your dashboard JSON.
3. Under **Options**, set the datasource to `Loki` (for log dashboards) or
   `Prometheus` (for metric dashboards).
4. Click **Import**.

To make the dashboard permanent (survive container restarts), save the JSON to
`grafana/dashboards/<name>.json` and restart Grafana:

```bash
docker compose restart grafana
```

Grafana reloads dashboard files from the mounted volume every 30 seconds, so
a restart is only needed if you add a new file.

#### 5c — Import via the HTTP API (CI / automation)

For scripted environments, import with the Grafana API. The dashboard JSON
must be wrapped in a `dashboard` object and given an `overwrite` flag:

```bash
curl -sS -X POST "$GRAFANA_URL/api/dashboards/db" \
  -H "Authorization: Bearer $GRAFANA_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @<(jq '{dashboard: ., overwrite: true, folderUid: "stellarkraal"}' \
    grafana/dashboards/backend.json)
```

> **Datasource UIDs:** Dashboards reference datasources by UID. Ensure the
target environment has datasources named `Prometheus` and `Loki` (see
`grafana/provisioning/datasources/`), or update the `datasource` fields in the
JSON before importing.

### 6 — Write your first Loki log query

Loki queries use **LogQL** — a log query language similar to PromQL. Follow
these steps to explore logs in the Grafana Explore view:

1. Click the **Explore** icon (compass) in the left sidebar.
2. Make sure the datasource selector (top-left) shows **Loki**.
3. Enter a query in the query editor.

#### Basic queries

**All backend logs:**

```logql
{container="backend"}
```

**Only error-level lines:**

```logql
{container="backend"} | json | level="error"
```

**Lines containing a keyword** (loan liquidations):

```logql
{container="backend"} |= "liquidat"
```

**Structured field filter** (slow requests over 500 ms):

```logql
{service="backend"} | json | duration > 500
```

**Rate of errors per minute** (metric query):

```logql
sum(rate({container="backend"} | json | level="error" [1m]))
```

#### Filtering by time range

Use the time-range picker in the top-right corner of the Explore view. For
active development, **Last 15 minutes** or **Last 1 hour** works well. For
incident review, set an absolute range that covers the event window.

#### Useful label selectors

| Goal | LogQL |
|------|-------|
| All container logs | `{container=~"backend\|frontend"}` |
| Promtail errors | `{container="promtail"}` |
| Specific request ID | `{container="backend"} \|= "req-abc123"` |
| Auth failures | `{container="backend"} \|= "Unauthorized"` |
| RPC failures | `{service="backend"} \|= "rpc" \| level="error"` |
| Rate-limited requests | `{container="backend"} \|= "Too many requests"` |

> **Full LogQL reference:** https://grafana.com/docs/loki/latest/logql/

### 7 — Tear down

Stop all containers and remove the network:

```bash
docker compose --profile monitoring down
```

To also delete named volumes (resets Grafana customisations, Prometheus TSDB,
**and PostgreSQL data**):

```bash
docker compose --profile monitoring down -v
```

---

## Promtail → Loki Log Pipeline

Promtail tails Docker's `json-file` logs, attaches labels, and pushes entries
to Loki. Understanding this pipeline is essential when logs are missing or
labels are wrong.

```
Docker json-file logs (/var/lib/docker/containers/*/*-json.log)
        │
        ▼
Promtail  ── scrape_configs: relabel container name → `container` label
        │   pipeline_stages: parse JSON, extract level, drop noise
        ▼
Loki      ── stores streams keyed by label set (container, service, level)
        │
        ▼
Grafana   ── queries via LogQL
```

### Annotated Promtail configuration

```yaml
# observability/promtail-config.yml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  # Tracks how far Promtail has read each file so restarts don't re-send logs.
  filename: /tmp/positions.yaml

clients:
  # Loki push endpoint. Use the Docker service name locally; the staging
  # endpoint in deployed environments.
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      # Service discovery: Promtail asks the Docker socket for running containers.
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      # Use the container name as the `container` label (strips leading '/')
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'
      # Expose the compose service name as `service`
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'service'
    pipeline_stages:
      # Parse the log line as JSON and extract fields.
      - json:
          expressions:
            level: level
            message: message
            timestamp: timestamp
            requestId: requestId
            route: route
      # Promote level, requestId, and route to Loki stream labels so they can
      # be used in LogQL stream selectors, e.g.:
      #   {service="backend", level="error"}
      #   {service="backend", route="/api/v1/loans"}
      - labels:
          level:
          requestId:
          route:
      # Parse the structured timestamp so Loki stores the original log time
      # rather than the scrape time.
      - timestamp:
          source: timestamp
          format: RFC3339Nano
          fallback_formats:
            - RFC3339
            - UnixMs
```

### Key pipeline stages

| Stage | Purpose |
|-------|---------|
| `docker_sd_configs` | Discovers containers automatically; no static file paths |
| `relabel_configs` | Maps Docker metadata to Loki labels (`container`, `service`) |
| `json` | Parses structured log lines; extracts `level`, `requestId`, and `route` |
| `labels` | Promotes extracted fields to indexed Loki stream labels |
| `timestamp` | Uses the application's original log timestamp rather than the scrape time |

> **Cardinality warning:** `requestId` has high cardinality (one value per
> request). It is promoted to a label here to enable fast per-request log
> tracing, but avoid adding similarly unbounded fields (user IDs, free-form
> messages) to the label set. For values you only need to filter rather than
> select, use `|=` line filters or `| json` field filters instead.

### LogQL queries for common debugging scenarios

The following queries cover the most common debugging patterns. Run them in
the Grafana Explore view with the **Loki** datasource selected.

**All backend error logs:**

```logql
{service="backend", level="error"}
```

**Trace all log lines for a specific request:**

```logql
{service="backend", requestId="<your-request-id>"}
```

**All logs for a specific route (e.g., loan creation):**

```logql
{service="backend", route="/api/v1/loans"}
```

**Errors on a specific route:**

```logql
{service="backend", route="/api/v1/loans", level="error"}
```

**Rate of error log lines per minute (for dashboards/alerts):**

```logql
sum(rate({service="backend", level="error"}[1m]))
```

**Slow requests (backend logs duration in ms):**

```logql
{service="backend"} | json | duration > 500
```

**Auth failures:**

```logql
{service="backend"} | json | level="warn" |= "Unauthorized"
```

### Verifying the pipeline

1. Check Promtail is scraping: http://localhost:9080/targets
2. Confirm Loki received data: http://localhost:3100/metrics (look for
   `loki_distributor_lines_received_total`).
3. Query in Grafana Explore: `{container="backend"}` should return lines.

---

## Custom Prometheus Alert Rules

Alert rules live in `prometheus/alerts/` and are loaded via `rule_files` in
`prometheus/prometheus.yml`. Each rule evaluates a PromQL expression and fires
when the condition holds for a configured `for` duration.

### Rule file structure

```yaml
# prometheus/alerts/backend.yml
groups:
  - name: stellarkraal-backend
    rules:
      - alert: HighErrorRate
        # Fires when >5% of requests are 5xx over a 5-minute window.
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m]))
            / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "High 5xx error rate ({{ $value | humanizePercentage }})"
          description: "Error rate exceeded 5% for 5 minutes."
          runbook_url: "https://github.com/.../docs/observability.md#runbook-high-error-rate"
```

### Authoring a new rule

1. **Pick a metric** from the [Custom metrics](#custom-metrics) tables.
2. **Prototype the PromQL** in the Prometheus UI (`/graph`) or Grafana
   Explore with the Prometheus datasource. Confirm it returns the expected
   series before writing the rule.
3. **Add the rule** to the appropriate file under `prometheus/alerts/`.
   Use a descriptive `alert` name, a `severity` label (`warning` or
   `critical`), and a `runbook_url` annotation.
4. **Validate the syntax** with `promtool`:

   ```bash
   promtool check rules prometheus/alerts/backend.yml
   ```

5. **Reload Prometheus** without a restart (requires `--web.enable-lifecycle`):

   ```bash
   curl -X POST http://localhost:9090/-/reload
   ```

6. **Confirm the rule loaded** at http://localhost:9090/rules — it should
   appear under its group with state `inactive`.

### Testing a rule

- **Unit tests:** `promtool test rules` runs rule expressions against synthetic
  time series. Place tests in `prometheus/alerts/tests/`:

  ```yaml
  # prometheus/alerts/tests/backend_test.yml
  rule_files:
    - ../backend.yml
  evaluation_interval: 1m
  tests:
    - interval: 1m
      input_series:
        - series: 'http_requests_total{status_code="500"}'
          values: '0+10x10'
        - series: 'http_requests_total{status_code="200"}'
          values: '0+90x10'
      alert_rule_test:
        - eval_time: 10m
          alertname: HighErrorRate
          exp_alerts:
            - exp_labels:
                severity: critical
                team: backend
  ```

  Run with:

  ```bash
  promtool test rules prometheus/alerts/tests/backend_test.yml
  ```

- **Live testing:** temporarily lower the threshold or `for` duration in a
  scratch rule, trigger the condition, and watch the rule transition to
  `pending` then `firing` at `/rules`.

---

## Runbook: Responding to Pre-defined Alerts

Each pre-defined alert links here via its `runbook_url` annotation. Work
through the steps in order; escalate if the issue is not resolved within the
stated window.

### Runbook: HighErrorRate

**Meaning:** More than 5% of HTTP requests returned 5xx for 5 minutes.

1. Open the **StellarKraal Backend** dashboard and check the error-rate panel
   to confirm the spike and identify the affected `route`.
2. In Grafana Explore, query the failing route's logs:
   `{container="backend"} | json | level="error"`.
3. Check backend health: `curl http://localhost:3001/api/v1/health`.
4. If errors correlate with a recent deploy, roll back.
5. If errors are DB-related, check the DB pool metrics and RDS status.

### Runbook: HighLatency

**Meaning:** p95 request latency exceeded the threshold for 10 minutes.

1. Check the latency-percentile panel on the backend dashboard.
2. Identify slow routes via `http_request_duration_seconds` breakdown.
3. Inspect RPC latency metrics — a slow Stellar RPC can dominate latency.
4. Check DB pool saturation (`db_pool_*` metrics).

### Runbook: BackendDown

**Meaning:** Prometheus cannot scrape `/metrics` for 2 minutes.

1. Verify the container is running: `docker compose ps backend`.
2. Check logs: `{container="backend"}` in Explore, or
   `docker compose logs backend`.
3. Confirm the metrics endpoint responds:
   `curl http://localhost:3001/metrics`.
4. Restart if crashed: `docker compose restart backend`.

### Runbook: DBPoolExhausted

**Meaning:** The DB connection pool has no free connections.

1. Check `db_pool_active_connections` vs `db_pool_max_connections`.
2. Look for long-running queries in the backend logs.
3. If sustained, scale the pool size or investigate connection leaks.

### Runbook: SLO_HighErrorRate

**Meaning:** HTTP 5xx error rate exceeded 1% for 5 consecutive minutes (SLO breach).

1. Open the **StellarKraal Backend** dashboard → error-rate panel to confirm
   the spike and identify the affected `route`.
2. In Grafana Explore, query the failing route's logs:
   `{container="backend"} | json | level="error"`.
3. Check backend health: `curl http://localhost:3001/api/v1/health`.
4. If errors correlate with a recent deploy, roll back.
5. If errors are DB-related, check the DB pool metrics (`db_pool_*`) and RDS status.
6. If errors are contract-related, check the `stellarkraal_contract_rpc_duration_seconds`
   histogram for elevated error counts — the RPC node may be degraded.

### Runbook: SLO_HighP99Latency

**Meaning:** p99 HTTP request latency exceeded 2 seconds for 5 consecutive minutes (SLO breach).

1. Check the latency-percentile panel on the backend dashboard.
2. Identify slow routes via `http_request_duration_seconds` breakdown by `route`.
3. Inspect contract RPC latency with:
   ```promql
   histogram_quantile(0.99,
     sum by (le, operation) (rate(stellarkraal_contract_rpc_duration_seconds_bucket[5m])))
   ```
4. Check DB pool saturation (`db_pool_*` metrics) — pool exhaustion inflates p99.
5. If contract RPC latency is the bottleneck, verify `RPC_URL` points to a
   low-latency endpoint and the circuit breaker is not repeatedly tripping.

### Runbook: SLO_ContractRpcFailureRate

**Meaning:** Soroban contract RPC call failure rate exceeded 5% for 5 consecutive minutes.

1. Check the contract RPC error rate by operation:
   ```promql
   sum by (operation) (
     rate(stellarkraal_contract_rpc_duration_seconds_count{status="error"}[5m]))
   ```
2. Identify which operation is failing (`request_loan`, `repay_loan`,
   `liquidate`, `get_loan`, `health_factor`).
3. Check the Soroban RPC node health:
   `curl -s "$RPC_URL"/health`.
4. Inspect backend logs for contract error codes:
   `{container="backend"} | json | level="error" |= "contract"`.
5. If the RPC node is down or degraded, failover to a backup endpoint or
   contact the RPC provider.
6. Check whether the circuit breaker (`opossum`) has opened — look for
   `stellarkraal_alert_fired{rule="rpc-circuit-open"}`.

> **Adding a runbook:** When you add a new alert, add a matching
> `### Runbook: <AlertName>` section here and point the rule's
> `runbook_url` annotation at its anchor.

---

## Architecture

```
backend ──┐
           ├─► Docker json-file logs ──► Promtail ──► Loki ──► Grafana
frontend ──┘

backend ──► prom-client registry ──► GET /metrics ──► Prometheus ──► Grafana
```

| Pillar | Tool | Purpose |
|--------|------|---------|
| Metrics | [Prometheus](https://prometheus.io/) | Scrapes numeric time-series from the backend `/metrics` endpoint |
| Logs | [Loki](https://grafana.com/oss/loki/) + [Promtail](https://grafana.com/docs/loki/latest/send-data/promtail/) | Aggregates structured logs from all Docker containers |
| Dashboards | [Grafana](https://grafana.com/oss/grafana/) | Visualises metrics and logs, fires alert notifications |

---

## Service URLs

### Local development

All observability services are defined in `docker-compose.yml` under the
`monitoring` profile. Start the full stack (core + observability) with:

```bash
docker compose --profile monitoring up --build
```

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | http://localhost:3200 | Anonymous viewer (no login) |
| Prometheus | http://localhost:9090 | — |
| Loki | http://localhost:3100 | — |
| Backend API | http://localhost:3001 | — |

### Staging

Staging mirrors production. Observability services are deployed separately
(via Kubernetes Helm charts or equivalent). Access is restricted to VPN/SSO.

| Service | URL |
|---------|-----|
| Grafana | `https://grafana-staging.stellarkraal.example.com` |
| Prometheus | `https://prometheus-staging.stellarkraal.example.com` |
| Loki | `https://loki-staging.stellarkraal.example.com` |

Staging uses the same dashboard JSON files as local dev. Datasource URLs
point to the staging Loki/Prometheus endpoints rather than Docker service
names.

---

## Metrics (Prometheus)

### How it works

The backend uses [`prom-client`](https://github.com/siimon/prom-client) to
expose a Prometheus-compatible metrics registry. A middleware instruments
every HTTP request, and the connection pool reports DB metrics in real time.

The registry is exported at `GET /metrics` (exposed on port 3001 alongside
the API).

### Custom metrics

All custom metrics are defined in
[`backend/src/metrics.ts`](../backend/src/metrics.ts) and registered on a
dedicated `Registry` instance.

#### HTTP metrics

| Metric | Type | Labels | Buckets | Description |
|--------|------|--------|---------|-------------|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | — | Total HTTP requests served since process start |
| `http_request_duration_seconds` | Histogram | `method`, `route` | — | Request latency distribution |

#### Business metrics — loan lifecycle

These metrics give Grafana dashboards visibility into platform health beyond
process-level stats. They are emitted from
[`backend/src/services/loanService.ts`](../backend/src/services/loanService.ts),
the `/metrics` handler in [`backend/src/index.ts`](../backend/src/index.ts),
and the Soroban RPC client in
[`backend/src/utils/rpcClient.ts`](../backend/src/utils/rpcClient.ts).

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `loan_created_total` | Counter | `collateral_type`, `status` | Incremented each time a `request_loan` transaction is built successfully |
| `loan_repaid_total` | Counter | `collateral_type`, `status` | Incremented by the repaid **amount in stroops** each time a `repay_loan` transaction is built |
| `loan_liquidated_total` | Counter | `collateral_type`, `status` | Incremented each time a loan is liquidated |
| `active_loans_total` | Gauge | `state` (`Active`, `AtRisk`) | Current number of open loans by state. Recomputed from the loan store on every `/metrics` scrape; both series are always present (0 when empty) |
| `contract_rpc_duration_seconds` | Histogram | `method`, `status` (`success`, `error`) | Latency of every Soroban RPC call (`getAccount`, `prepareTransaction`, `simulateTransaction`, `sendTransaction`, `getTransaction`, `getEvents`, `getHealth`). Buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10 s |

Label notes:

- `collateral_type` is the animal type of the (first) pledged collateral, or
  `unknown` if it cannot be resolved.
- `status` on the loan counters is the loan status at the time of the event
  (`active`, `at_risk`, `liquidated`, …).
- `method` on `contract_rpc_duration_seconds` is the RPC client method name.
  Calls rejected by an open circuit breaker are recorded with
  `status="error"`.

##### Example PromQL queries

```promql
# Loans created per hour, by collateral type
sum by (collateral_type) (increase(loan_created_total[1h]))

# Liquidation rate: liquidations as a share of loans created over 24h
sum(increase(loan_liquidated_total[24h]))
  / clamp_min(sum(increase(loan_created_total[24h])), 1)

# Repaid volume (XLM) over the last day (1 XLM = 10^7 stroops)
sum(increase(loan_repaid_total[24h])) / 1e7

# Open loans by state (stack these in a time-series panel)
active_loans_total

# Share of open loans that are at risk
active_loans_total{state="AtRisk"}
  / clamp_min(sum(active_loans_total), 1)

# p95 Soroban RPC latency by method
histogram_quantile(0.95,
  sum by (le, method) (rate(contract_rpc_duration_seconds_bucket[5m])))

# Soroban RPC error ratio
sum(rate(contract_rpc_duration_seconds_count{status="error"}[5m]))
  / clamp_min(sum(rate(contract_rpc_duration_seconds_count[5m])), 1e-9)
```

Suggested alert: page when `active_loans_total{state="AtRisk"}` exceeds 20% of
open loans for 15 minutes, or when p95 `contract_rpc_duration_seconds`
exceeds 5 s for 10 minutes.

#### Business-level metrics (`stellarkraal_` prefix)

The metrics below use the `stellarkraal_` prefix to distinguish them from the
infrastructure-level metrics above. They provide business-level observability
for loan state transitions, contract RPC call durations by business operation,
and the total active loan count. They are referenced by the SLO-based alert
rules in [`observability/prometheus-rules.yml`](../observability/prometheus-rules.yml)
(the `stellarkraal.slo` group).

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `stellarkraal_loan_state_transitions_total` | Counter | `from_state`, `to_state` | Incremented on every loan status change. Covers all transitions: `pending→active`, `active→repaid`, `active→liquidated`, `active→at_risk`, `at_risk→repaid`, `at_risk→liquidated`, `at_risk→active`. Instrumented in `logLoanStateTransition()` so both the state-machine `transition()` path and the direct `updateLoan()` store path are captured. |
| `stellarkraal_contract_rpc_duration_seconds` | Histogram | `operation`, `status` (`success`, `error`) | Duration of Soroban contract RPC calls labelled by business operation: `request_loan`, `repay_loan`, `liquidate`, `get_loan`, `health_factor`, `get_twap_data`, `get_fee_config`. Buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10 s. Instrumented via `timeStellarkraalContractRpc()` in `loanService.ts`. |
| `stellarkraal_active_loans_total` | Gauge | — | Current total number of active loans (status `active` or `at_risk`). A single scalar value (not segmented by state). Refreshed on every `/metrics` scrape alongside `active_loans_total`. |

##### Example PromQL queries

```promql
# Loan state transition rate over the last hour, by transition type
sum by (from_state, to_state) (increase(stellarkraal_loan_state_transitions_total[1h]))

# Most common transition path (which loans are being liquidated vs repaid)
topk(5, sum by (from_state, to_state) (
  increase(stellarkraal_loan_state_transitions_total[24h])))

# p99 contract RPC latency by business operation
histogram_quantile(0.99,
  sum by (le, operation) (
    rate(stellarkraal_contract_rpc_duration_seconds_bucket[5m])
  ))

# Contract RPC error rate by operation
sum by (operation) (
  rate(stellarkraal_contract_rpc_duration_seconds_count{status="error"}[5m])
)
  /
clamp_min(
  sum by (operation) (
    rate(stellarkraal_contract_rpc_duration_seconds_count[5m])
  ), 1e-9
)

# Overall contract RPC failure rate (used by SLO_ContractRpcFailureRate alert)
sum(rate(stellarkraal_contract_rpc_duration_seconds_count{status="error"}[5m]))
  / clamp_min(sum(rate(stellarkraal_contract_rpc_duration_seconds_count[5m])), 1e-9)

# Current active loan count (scalar)
stellarkraal_active_loans_total

# Active loan count trend (rate of change per minute)
deriv(stellarkraal_active_loans_total[1h])

# Liquidation rate as a share of all transitions from active
sum(increase(stellarkraal_loan_state_transitions_total{from_state="active",to_state="liquidated"}[24h]))
  / clamp_min(
    sum(increase(stellarkraal_loan_state_transitions_total{from_state="active"}[24h])), 1
  )
```

##### SLO alert rules

The SLO-based alert rules live in the `stellarkraal.slo` group in
[`observability/prometheus-rules.yml`](../observability/prometheus-rules.yml).
Unlike the push-based `stellarkraal_alert_fired` rules, these evaluate
directly against Prometheus metrics and do not depend on the backend's
`fireAlert()` function.

| Alert | SLO | Condition | `for` | Severity |
|-------|-----|-----------|-------|----------|
| `SLO_HighErrorRate` | Error rate ≤ 1% | `5xx rate > 1%` over 5m window | 5m | critical |
| `SLO_HighP99Latency` | p99 latency ≤ 2s | `p99 latency > 2s` over 5m window | 5m | critical |
| `SLO_ContractRpcFailureRate` | RPC failure ≤ 5% | `RPC error rate > 5%` over 5m window | 5m | critical |

Unit tests for these rules are in
[`observability/tests/slo-rules_test.yml`](../observability/tests/slo-rules_test.yml).
Run them with:

```bash
promtool test rules observability/tests/slo-rules_test.yml
```

Validate rule syntax with:

```bash
promtool check rules observability/prometheus-rules.yml
```

---
