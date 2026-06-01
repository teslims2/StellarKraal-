Backend logging
===============

This project uses `winston` for structured logging in the backend.

Key points
- **Configurable level**: Set `LOG_LEVEL` environment variable (default `info`).
- **Formats**: JSON output in `production` for log aggregation; pretty, colorized output in `development`.
- **Request-scoped logs**: A child logger with a `requestId` is attached to each request via middleware; use `(req as any).logger` in request handlers.
- **Timestamp**: All logs include a timestamp and level.
- **stdout**: Logs are written to `stdout` for compatibility with container logging systems.

Files
- `src/utils/logger.ts`: Winston configuration and `createRequestLogger(requestId)` helper.
- `src/middleware/audit.ts`: Dedicated audit logger with file rotation for audit events.

Notes
- Tests may mock `console` in a few places; production code uses the `logger` exports.

Closes #23
