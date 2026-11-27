# Docker Compose Services

This document describes the services defined in the Docker Compose files,
including service dependencies, startup order, health checks, volumes, and
resource limits.

---

## Service Overview

| Service | Profile | Ports | Description |
|---------|---------|-------|-------------|
| `postgres` | (default) | 5432 | PostgreSQL 15 database |
| `redis` | (default) | 6379 | Redis 7 cache |
| `backend` | (default) | 3001 | Node.js / Express API |
| `frontend` | (default) | 3000 | Next.js frontend |
| `contract-builder` | (default) | — | Rust WASM contract builder |
| `loki` | `observability` | 3100 | Log aggregation (Grafana Loki) |
| `promtail` | `observability` | — | Log shipper to Loki |
| `prometheus` | `observability` | 9090 | Metrics scraper (scrapes backend `/metrics`) |
| `grafana` | `observability` | 3200 | Dashboards (metrics + logs) |

---

## Service Startup Order and `depends_on` Relationships

### Startup order diagram

```
 ┌──────────┐    service_healthy     ┌─────────┐    service_healthy    ┌──────────┐
 │ postgres │ ──────────────────────►│         │ ─────────────────────►│          │
 └──────────┘                        │ backend │                        │ frontend │
 ┌──────────┐    service_healthy     │         │                        │          │
 │  redis   │ ──────────────────────►│         │                        │          │
 └──────────┘                        └─────────┘                        └──────────┘

 ┌──────┐   service_healthy   ┌──────────┐
 │ loki │ ───────────────────►│ promtail │
 └──────┘                     └──────────┘
    │
    │  service_started        ┌─────────────┐  service_started
    └────────────────────────►│             │◄──────────────────┐
                              │   grafana   │                   │
                              │             │          ┌────────┴────┐
                              └─────────────┘          │ prometheus  │
                                                        │  (depends   │
                                                        │  on backend │
                                                        │  started)   │
                                                        └─────────────┘
```

Each arrow is labelled with the `condition` Docker Compose enforces before the
dependent service starts. Two conditions are used in this project:

| Condition | Meaning |
|-----------|---------|
| `service_healthy` | Docker waits until the dependency's health check returns exit code 0 before starting the dependent container. The dependent service never starts if the dependency stays unhealthy beyond its `start_period + (retries × interval)`. |
| `service_started` | Docker waits only until the dependency container is running (not necessarily passing its health check). Used where readiness is confirmed by another mechanism (e.g., Prometheus scrape retries). |

### Full `depends_on` table

| Service | Depends on | Condition |
|---------|-----------|-----------|
| `backend` | `postgres` | `service_healthy` |
| `backend` | `redis` | `service_healthy` |
| `frontend` | `backend` | `service_healthy` |
| `promtail` | `loki` | `service_healthy` |
| `grafana` | `loki` | `service_started` |
| `grafana` | `prometheus` | `service_started` |
| `prometheus` | `backend` | `service_started` |

**What this means in practice:**

- `backend` will not begin its own startup sequence until both `postgres` and
  `redis` have passed their health checks. This eliminates the most common
  race condition — the API trying to query the DB before it has finished
  initialising.
- `frontend` waits for `backend` to be healthy, so the Next.js dev server (or
  production build) starts only once the API it proxies to is accepting
  requests.
- `promtail` waits for `loki` to be healthy so it does not attempt to push logs
  to an endpoint that is not ready.
- `prometheus` and `grafana` use `service_started` (not `service_healthy`)
  because they can tolerate a brief period where their upstream targets are not
  yet ready — Prometheus will simply retry the first scrape, and Grafana will
  show "No data" briefly rather than failing to start.

---

## Health Checks

### Full health check parameters

| Service | Test command | Interval | Timeout | Retries | Start period |
|---------|-------------|----------|---------|---------|-------------|
| `postgres` | `pg_isready -U ${POSTGRES_USER:-postgres}` | 10s | 5s | 5 | 10s |
| `redis` | `redis-cli ping` | 10s | 5s | 5 | 5s |
| `backend` | `wget -qO- http://localhost:3001/health` | 30s | 10s | 3 | 15s |
| `frontend` | `wget -qO- http://localhost:3000` | 30s | 10s | 3 | 20s |

**Parameter meanings:**

- **Interval** — how often Docker runs the test command after the previous
  attempt completes.
- **Timeout** — how long Docker waits for the test command before treating it
  as a failure.
- **Retries** — the number of consecutive failures needed before Docker marks
  the container `unhealthy`.
- **Start period** — a grace window during which failing health checks do not
  count toward the retry limit. This allows the process time to initialise
  before health checking begins in earnest.

The backend health check calls the `/health` endpoint, which returns HTTP 200
when the app is ready and HTTP 503 when the database is unreachable. `wget`
exits non-zero on any non-2xx response, so a 503 correctly marks the container
unhealthy and blocks dependent services.

### How to customise health check intervals and thresholds

Health check parameters are compiled into the image at build time via the
`HEALTHCHECK` Dockerfile instruction and also set in `docker-compose.yml` under
the `healthcheck:` key. The Compose declaration takes precedence over the
Dockerfile instruction at runtime.

Override any parameter for a specific service by adding (or modifying) the
`healthcheck:` block in a local override file. Create
`docker-compose.override.yml` (this file is auto-merged by Docker Compose and
should not be committed for environment-specific values):

```yaml
# docker-compose.override.yml — local health check overrides
services:
  backend:
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/health"]
      interval: 10s      # check more frequently during development
      timeout: 5s
      retries: 5
      start_period: 5s   # shorter grace period if startup is fast locally

  postgres:
    healthcheck:
      interval: 5s       # faster convergence when iterating on migrations
      retries: 10        # more retries on slow machines
```

You can also disable the health check entirely for a service (not recommended
for `postgres` or `redis`, since `backend` depends on them being healthy):

```yaml
services:
  frontend:
    healthcheck:
      disable: true
```

**Tuning guidance:**

| Situation | Recommended change |
|-----------|-------------------|
| Slow development machine (startup takes >15s) | Increase `start_period` for `backend` to 30–60s |
| Flaky network causing spurious health check timeouts | Increase `timeout` to 15–20s |
| Wanting faster feedback during active development | Decrease `interval` to 5–10s and `retries` to 2 |
| CI environment with strict time budgets | Decrease `start_period` and `interval`; increase `retries` |
| Production (tighter SLA for unhealthy detection) | Keep defaults or decrease `interval` to 15s |

---

## Volumes

### Named volumes (persist across `docker-compose down`)

| Volume | Service | Mount path | Purpose |
|--------|---------|-----------|---------|
| `postgres_data` | `postgres` | `/var/lib/postgresql/data` | PostgreSQL data files. All relational data (loans, collateral, users, migrations) lives here. Losing this volume is data loss. |
| `redis-data` | `redis` | `/data` | Redis RDB snapshot and AOF journal. Used to cache TWAP oracle prices and store idempotency keys. Losing it causes a cold cache on restart — no data loss beyond in-flight cache entries. |
| `loki-data` | `loki` | `/loki` | Loki log chunks and index. Losing it means historical logs are gone; new logs are written from the restart point. |
| `grafana-data` | `grafana` | `/var/lib/grafana` | Grafana internal state: user accounts, manual dashboard edits, alert states, and organisation settings. Provisioned dashboards (from `grafana/dashboards/`) survive a volume reset because they are re-read from the bind-mounted directory. |
| `prometheus-data` | `prometheus` | `/prometheus` | Prometheus TSDB blocks. Losing it resets all metric history. Active alerts may re-fire once Prometheus scrapes new data. |
| `cargo-cache` | `contract-builder` | `/usr/local/cargo/registry` | Cached Rust crate downloads. Losing it only forces a re-download on the next build — no functional impact. |

### Read-only configuration bind mounts

The observability services also receive several read-only bind mounts for
configuration files. These are not named volumes — they are sourced directly
from the repository and rebuilt from scratch whenever the files change:

| Host path | Container path | Service |
|-----------|---------------|---------|
| `./observability/prometheus.yml` | `/etc/prometheus/prometheus.yml` | `prometheus` |
| `./observability/prometheus-rules.yml` | `/etc/prometheus/rules/prometheus-rules.yml` | `prometheus` |
| `./observability/grafana-datasources.yml` | `/etc/grafana/provisioning/datasources/datasources.yml` | `grafana` |
| `./observability/grafana-dashboards.yml` | `/etc/grafana/provisioning/dashboards/dashboards.yml` | `grafana` |
| `./grafana/dashboards` | `/var/lib/grafana/dashboards` | `grafana` |
| `./observability/promtail-config.yml` | `/etc/promtail/config.yml` | `promtail` |

Changes to these files take effect on the next container restart (or on a
Prometheus config reload — see below). They do not require rebuilding images.

### Volume lifecycle and reset procedures

```bash
# Stop containers — all named volumes are preserved
docker compose down

# Stop containers AND delete all named volumes
# WARNING: destroys postgres_data (all loan and collateral records),
#          prometheus-data, loki-data, grafana-data, redis-data
docker compose down -v

# Remove a single volume without touching others
docker volume rm stellarkraal_postgres_data

# List all project volumes
docker volume ls --filter name=stellarkraal
```

**Selective reset procedures:**

| Goal | Command |
|------|---------|
| Reset only the database (clean slate for development) | `docker compose down ; docker volume rm stellarkraal_-_postgres_data ; docker compose up` |
| Reset Grafana customisations (keep provisioned dashboards) | `docker compose stop grafana ; docker volume rm stellarkraal_-_grafana-data ; docker compose start grafana` |
| Reset Prometheus metric history | `docker compose stop prometheus ; docker volume rm stellarkraal_-_prometheus-data ; docker compose start prometheus` |
| Flush the Redis cache (TWAP prices, idempotency keys) | `docker compose exec redis redis-cli FLUSHALL` — no volume removal needed |
| Full clean slate (all data gone) | `docker compose down -v` |

> **Warning:** `docker compose down -v` permanently deletes `postgres_data` and
> all stored application data. Run migrations again after bringing the stack
> back up: `docker compose exec backend npm run migrate:dev`.

---

## Profiles

Observability services (`loki`, `promtail`, `prometheus`, `grafana`) are
grouped under the `observability` Docker Compose profile. This keeps the default
`docker compose up` lightweight for developers who do not need the observability
stack, while still letting contributors replicate the production metrics and
log pipelines locally.

```bash
# Start only the core services (postgres, redis, backend, frontend)
docker compose up --build

# Start the full stack including observability
docker compose --profile observability up --build
```

Individual services can also be started on demand:

```bash
# Start just Grafana and its dependencies from the observability profile
docker compose --profile observability up grafana loki prometheus
```

### Enabling the observability profile

1. Start the stack with the profile enabled:

   ```bash
   docker compose --profile observability up --build
   ```

2. Open Grafana at http://localhost:3200. Anonymous viewer access is enabled,
   so no login is required for browsing the pre-provisioned dashboards. The
   Loki and Prometheus datasources are provisioned automatically.

3. Prometheus is pre-configured to scrape the backend `/metrics` endpoint
   (`http://backend:3001/metrics`) and is available at http://localhost:9090.

If metrics authentication is enabled on the backend, set `METRICS_TOKEN` in
your `.env` file (or export it in the shell) before starting the profile so
Prometheus can authenticate its scrapes:

```bash
# .env
METRICS_TOKEN=your-metrics-token
```

---

## Environment Variables

Both `backend` and `frontend` read from the `.env` file at the project root
via `env_file: .env`. Copy `.env.example` to create your local file:

```bash
cp .env.example .env
```

Before running `docker compose up`, validate that all required variables are
set by running the env pre-flight script:

```bash
./scripts/check-env.sh
```

The script checks every required variable, warns about insecure defaults, and
confirms that the core ports (3000, 3001, 5432, 6379) are free. Fix any
reported issues before starting the stack.

Key variables consumed by each service:

| Variable | Service | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `postgres`, `backend` | DB username (default: `postgres`) |
| `POSTGRES_PASSWORD` | `postgres`, `backend` | DB password (default: `postgres`) |
| `POSTGRES_DB` | `postgres`, `backend` | DB name (default: `stellarkraal`) |
| `PORT` | `backend` | API listen port (default: `3001`) |
| `NEXT_PUBLIC_API_URL` | `frontend` | Backend API base URL |
| `GF_SECURITY_ADMIN_USER` | `grafana` (prod) | Grafana admin username |
| `GF_SECURITY_ADMIN_PASSWORD` | `grafana` (prod) | Grafana admin password |

See [docs/guides/environment-variables.md](guides/environment-variables.md) for
the full variable reference.

---

## Resource Limits

All containers have explicit CPU and memory `deploy.resources` limits and
reservations defined directly in `docker-compose.yml`. This prevents a runaway
container from consuming all host resources and starving sibling services.

| Service | Memory limit | CPU limit | Memory reservation | CPU reservation |
|---------|-------------|-----------|-------------------|-----------------|
| `contract-builder` | 1024 MB | 1.0 | 256 MB | 0.25 |
| `backend` | 512 MB | 0.5 | 128 MB | 0.1 |
| `frontend` | 512 MB | 0.5 | 64 MB | 0.05 |
| `loki` | 256 MB | 0.5 | 64 MB | 0.1 |
| `promtail` | 128 MB | 0.25 | 32 MB | 0.05 |
| `prometheus` | 256 MB | 0.5 | 64 MB | 0.1 |
| `grafana` | 256 MB | 0.5 | 64 MB | 0.1 |

The `postgres` and `redis` services do not have limits set in the development
compose file so that local development is not disrupted by DB-intensive
migrations or test suites. The production overlay (`docker-compose.prod.yml`)
adds limits to those services to match the ECS Fargate task definitions.

Resource limits are applied via the `deploy.resources` block, for example:

```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 512M
    reservations:
      cpus: '0.1'
      memory: 128M
```

---

## Observability Services

See [docs/observability.md](observability.md) for the full observability stack
reference, including Prometheus metrics, Loki/Promtail log shipping, Grafana
dashboards, and alert rules.

Quick start for the observability profile:

```bash
docker compose --profile observability up --build
```

Prometheus scrapes the backend `/metrics` endpoint, and Grafana is provisioned
with both the Loki and Prometheus datasources plus the pre-built dashboards. If
metrics authentication is enabled, set `METRICS_TOKEN` in `.env` before
starting the profile.

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | http://localhost:3200 | Anonymous viewer (no login) |
| Prometheus | http://localhost:9090 | — |
| Loki | http://localhost:3100 | — |

---

## Log Rotation

All services use the `json-file` log driver with rotation limits to prevent
logs from exhausting disk space on long-running instances:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

The `backend` and `frontend` services include a `tag` option so Promtail can
identify them by service name in Loki:

```yaml
logging:
  driver: json-file
  options:
    tag: "backend"   # or "frontend"
```

After starting the stack, verify the effective log settings for a container:

```bash
docker inspect --format '{{.HostConfig.LogConfig}}' <container_name>
```

---

## Staging Overlay

The `docker-compose.staging.yml` overlay file is layered on top of the base
file and points the stack at Stellar testnet:

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d
```

The overlay replaces the RPC endpoint (`STAGING_RPC_URL`) and contract ID
(`STAGING_CONTRACT_ID`). All service dependencies and health checks remain
unchanged.
