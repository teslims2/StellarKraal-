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

## Startup Order and Dependencies

```
postgres ──┐
            ├─► backend ──► frontend
redis ──────┘

loki ──► promtail
loki ──┐
       ├─► grafana
prometheus ──┘  (prometheus depends on backend being up)
```

- `backend` waits for `postgres` and `redis` to pass their health checks before starting.
- `frontend` waits for `backend` to pass its health check.
- `promtail` waits for `loki`.
- `grafana` waits for both `loki` and `prometheus`.

---

## Health Checks

| Service | Command | Interval | Retries |
|---------|---------|----------|---------|
| `postgres` | `pg_isready -U $POSTGRES_USER` | 10s | 5 |
| `redis` | `redis-cli ping` | 10s | 5 |
| `backend` | `wget -qO- http://localhost:3001/health` | 30s | 3 |
| `frontend` | `wget -qO- http://localhost:3000` | 30s | 3 |

---

## Volumes

### Named volumes (persist across `docker-compose down`)

| Volume | Service | Mount path | Description |
|--------|---------|-----------|-------------|
| `postgres_data` | `postgres` | `/var/lib/postgresql/data` | PostgreSQL data directory |
| `redis-data` | `redis` | `/data` | Redis RDB/AOF persistence |
| `loki-data` | `loki` | `/loki` | Loki log chunks |
| `grafana-data` | `grafana` | `/var/lib/grafana` | Grafana dashboards and state |
| `prometheus-data` | `prometheus` | `/prometheus` | Prometheus TSDB |
| `cargo-cache` | `contract-builder` | `/usr/local/cargo/registry` | Rust dependency cache |

### Volume lifecycle

```bash
# Stop containers — volumes are preserved
docker compose down

# Stop containers AND delete all named volumes (destructive — loses DB data)
docker compose down -v
```

> **Warning:** `docker compose down -v` permanently deletes the `postgres_data`
> volume and all stored data. Only use it when you want a clean slate.

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

## Resource Limits (`docker-compose.prod.yml`)

Production containers have explicit CPU and memory limits to match the ECS
Fargate task definitions and prevent resource exhaustion on the host.

| Service | Memory limit | CPU limit | Memory reservation | CPU reservation |
|---------|-------------|-----------|-------------------|-----------------|
| `postgres` | 1024 MB | 0.5 | 256 MB | 0.1 |
| `redis` | 256 MB | 0.25 | 64 MB | 0.05 |
| `backend` | 512 MB | 0.25 | 128 MB | 0.1 |
| `frontend` | 256 MB | 0.25 | 64 MB | 0.05 |
| `loki` | 256 MB | 0.5 | 64 MB | 0.1 |
| `promtail` | 128 MB | 0.25 | 32 MB | 0.05 |
| `grafana` | 256 MB | 0.5 | 64 MB | 0.1 |

These limits are applied via the `deploy.resources` block in
`docker-compose.prod.yml`. The development `docker-compose.yml` intentionally
omits per-service limits (except `contract-builder`) to avoid interfering with
local IDE and build tooling.

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
