# Webhook Signing — HMAC-SHA256 (Issue #1463)

Every outgoing webhook delivery from StellarKraal is signed with HMAC-SHA256
so subscribers can verify that payloads originated from StellarKraal and have
not been tampered with in transit.

## How it works

1. When you register a webhook, the API generates a unique 64-character hex
   secret for that subscription. The secret is returned **once** at registration
   and is never retrievable afterwards. Store it securely (e.g. in a secret
   manager or environment variable).

2. For every delivery, StellarKraal computes:
   ```
   signature = HMAC-SHA256(key=secret, message=raw_request_body)
   ```
   and sends the result as:
   ```
   X-StellarKraal-Signature: sha256=<64-char-hex-digest>
   ```

3. Your endpoint should compute the same signature from the raw request body
   and compare it with a constant-time equality check.

## Registration

```http
POST /api/v1/webhooks
Content-Type: application/json

{
  "url": "https://your-server.example.com/hooks/stellarkraal"
}
```

Response (secret shown only once):

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "url": "https://your-server.example.com/hooks/stellarkraal",
  "secret": "b94d27b9934d3e08a52e52d7da7dabfac484efe04294e576ef75e49....",
  "createdAt": 1700000000000,
  "encrypt": false
}
```

## Verifying signatures

### Node.js / TypeScript

```typescript
import crypto from "crypto";
import type { Request, Response } from "express";

const WEBHOOK_SECRET = process.env.STELLARKRAAL_WEBHOOK_SECRET!;

export function verifyWebhook(req: Request, res: Response, next: () => void) {
  const signature = req.headers["x-stellarkraal-signature"] as string | undefined;
  if (!signature) {
    return res.status(401).json({ error: "Missing X-StellarKraal-Signature header" });
  }

  // Use the raw body buffer — JSON.stringify re-ordering would break the HMAC
  const rawBody = (req as any).rawBody as Buffer;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expected);

  if (
    sigBuffer.length !== expBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expBuffer)
  ) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  next();
}
```

### Python

```python
import hashlib
import hmac
import os

WEBHOOK_SECRET = os.environ["STELLARKRAAL_WEBHOOK_SECRET"]

def verify_webhook(raw_body: bytes, signature_header: str) -> bool:
    """Return True if the signature is valid, False otherwise."""
    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    # Constant-time comparison prevents timing attacks
    return hmac.compare_digest(expected, signature_header)
```

### Go

```go
package webhook

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "os"
)

func VerifyWebhook(rawBody []byte, signatureHeader string) bool {
    secret := []byte(os.Getenv("STELLARKRAAL_WEBHOOK_SECRET"))
    mac := hmac.New(sha256.New, secret)
    mac.Write(rawBody)
    expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(expected), []byte(signatureHeader))
}

func ExampleHandler(body []byte, sig string) error {
    if !VerifyWebhook(body, sig) {
        return fmt.Errorf("invalid webhook signature")
    }
    // process body...
    return nil
}
```

## Security notes

- Always use a **constant-time** comparison (`timingSafeEqual`, `hmac.compare_digest`,
  `hmac.Equal`). A naive `===` comparison leaks timing information that an attacker
  can exploit to forge signatures.
- Validate the signature **before** parsing or acting on the payload body.
- Rotate the signing secret by deleting the webhook registration and re-registering.
  Deliveries in-flight at rotation time may fail verification; a brief overlap
  window (validate against both old and new secrets) can be used to avoid dropped
  events during rotation.
- The secret is 32 random bytes encoded as 64 hex characters. Do not truncate or
  transform it before storing.

## Payload format

Each delivery body is a JSON object:

```json
{
  "event": "loan.approved",
  "payload": { "loan_id": "abc123", "lender": "GABC..." },
  "timestamp": 1700000000000
}
```

The HMAC is computed over the **exact bytes** sent in the HTTP request body,
including whitespace. Do not re-serialise or pretty-print the payload before
computing the verification digest.

## Encrypted deliveries

If you registered the webhook with `"encrypt": true`, the body will instead be:

```json
{
  "event": "loan.approved",
  "iv": "aabbcc...",
  "encrypted_payload": "deadbeef...",
  "auth_tag": "112233..."
}
```

The payload is AES-256-GCM encrypted. The key is derived from your signing
secret using HKDF-SHA256 with the info string
`"stellarkraal-webhook-encryption"`. See
[`backend/src/webhooks.ts`](../backend/src/webhooks.ts) for the reference
`deriveEncryptionKey` / `decryptPayload` implementation.

The `X-StellarKraal-Signature` header is still present and covers the entire
encrypted body. Verify the signature first, then decrypt.
