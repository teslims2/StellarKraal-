# Idempotency for Loan Creation and Collateral Registration

## Overview
The `POST /api/v1/loans` and `POST /collateral` endpoints support idempotency to prevent duplicate resource creation when clients retry requests.

## Collateral Registration (`POST /collateral`)

### Header Format
Clients may include an `Idempotency-Key` request header with a non-empty string value:

```
Idempotency-Key: my-unique-key-001
```

### Replay Window
Duplicate requests using the same key within **24 hours** return the original `201 Created` response, including the original response body. Replayed responses include the header:

```
X-Idempotent-Replayed: true
```

### Storage
Idempotency keys and their response snapshots are persisted in the `idempotency_keys` database table with an `expires_at` TTL (24 hours from creation). Expired records are purged and no longer replayed.

### Missing Key
Omitting the `Idempotency-Key` header does **not** cause an error; the request is processed normally. The omission is flagged in the audit log so it can be traced.

### Example

```
# First request
curl -X POST /collateral \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: my-unique-key-001" \
  -d '{"type":"property","value":500000}'

# Retry with same key - returns original 201 response
# Response includes: X-Idempotent-Replayed: true
curl -X POST /collateral \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: my-unique-key-001" \
  -d '{"type":"property","value":500000}'
```

## How It Works

1. **Client includes `Idempotency-Key` header** in the request
2. **Server stores the response** for that key for 24 hours
3. **If the same key is used again**, the server returns the original response

## Request Format

### Headers
{
  "success": true,
  "data": {
    "id": "loan-123",
    "amount": 1000,
    "collateralId": "col-001",
    "status": "pending",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Loan created successfully"
}
{
  "success": true,
  "data": {
    "id": "loan-123",
    "amount": 1000,
    "collateralId": "col-001",
    "status": "pending",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Loan created successfully"
}
{
  "error": "Missing Required Header",
  "message": "Idempotency-Key header is required for POST /api/v1/loans"
}
{
  "error": "Invalid Header",
  "message": "Idempotency-Key must be a non-empty string"
}
# First request
curl -X POST /api/v1/loans \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: my-unique-key-001" \
  -d '{"amount":1000,"collateralId":"col-001"}'

# Second request (same key) - returns original response
curl -X POST /api/v1/loans \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: my-unique-key-001" \
  -d '{"amount":1000,"collateralId":"col-001"}'
curl -X POST /api/v1/loans \
  -H "Authorization: Bearer <token>" \
  -d '{"amount":1000,"collateralId":"col-001"}'
# Returns 422 with error message
CREATE TABLE idempotency_records (
  id UUID PRIMARY KEY,
  request_id VARCHAR(255) UNIQUE NOT NULL,
  status_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  status_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);
