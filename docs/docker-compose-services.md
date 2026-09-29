# Docker Compose Services

This document describes the services defined in the Docker Compose files and the
logging configuration applied to every service.

## Log Rotation

All services across `docker-compose.yml`, `docker-compose.prod.yml`, and
`docker-compose.staging.yml` use the `json-file` log driver with rotation limits
so that container logs cannot exhaust disk space on long-running instances.

Each service includes the following logging configuration:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

- `driver: json-file` — the default Docker log driver, writing JSON-formatted logs.
- `max-size: "10m"` — each log file is rotated once it reaches 10 MB.
- `max-file: "3"` — at most 3 rotated log files are retained per container.

This caps per-container log storage at roughly 30 MB (3 files × 10 MB).

## Services

The logging configuration above is applied to every service in each compose file,
including the application, database, cache, and any auxiliary services. When
adding a new service, copy the `logging` block so rotation remains consistent.

## Verifying Configuration

After starting the stack, confirm the effective log settings for a container:

```sh
docker inspect --format '{{.HostConfig.LogConfig}}' <container_name>
```

The output should show the `json-file` driver with `max-size` and `max-file`
options matching the values above.
