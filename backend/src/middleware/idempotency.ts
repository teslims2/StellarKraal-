import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { db } from '../db';
import { insertAuditEntry } from '../services/audit';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface IdempotencyRow {
  id: number;
  idempotency_key: string;
  request_hash: string;
  status: number;
  body: string;
  created_at: string;
  expires_at: string;
}

/**
 * Compute a stable hash of the request (method + path + body) so that
 * reuse of the same key with a different payload can be detected.
 * @param req - The incoming Express request.
 * @returns Hex-encoded SHA-256 hash of the request signature.
 */
function computeRequestHash(req: Request): string {
  const body = req.body !== undefined ? JSON.stringify(req.body) : '';
  const signature = `${req.method}:${req.originalUrl || req.path}:${body}`;
  return createHash('sha256').update(signature).digest('hex');
}

/**
 * Look up a non-expired idempotency row for the given key.
 * @param key - The idempotency key supplied by the client.
 * @returns The stored row, or undefined if absent or expired.
 */
async function findIdempotencyRow(key: string): Promise<IdempotencyRow | undefined> {
  const row = await db<IdempotencyRow>('idempotency_keys')
    .where({ idempotency_key: key })
    .where('expires_at', '>', new Date().toISOString())
    .first();
  return row;
}

/**
 * Persist a response snapshot for the given idempotency key.
 * @param key - The idempotency key supplied by the client.
 * @param requestHash - Hash of the originating request.
 * @param status - HTTP status code of the response.
 * @param body - Response body to cache.
 */
async function persistIdempotencyRow(
  key: string,
  requestHash: string,
  status: number,
  body: unknown,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);
  await db('idempotency_keys')
    .insert({
      idempotency_key: key,
      request_hash: requestHash,
      status,
      body: JSON.stringify(body),
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .onConflict('idempotency_key')
    .ignore();
}

/**
 * Delete idempotency rows whose TTL has elapsed.
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<void> {
  try {
    await db('idempotency_keys')
      .where('expires_at', '<=', new Date().toISOString())
      .del();
  } catch (err) {
    // Cleanup failures should not crash the process; log and continue.
    // eslint-disable-next-line no-console
    console.error('Failed to clean up expired idempotency keys:', err);
  }
}

// Schedule periodic cleanup of expired rows. Guard against multiple timers
// being registered when the module is re-imported (e.g. in tests).
const cleanupTimer = setInterval(cleanupExpiredIdempotencyKeys, CLEANUP_INTERVAL_MS);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

/**
 * Express middleware implementing database-backed idempotency for endpoints
 * that accept an `Idempotency-Key` header.
 *
 * - On a duplicate request within the TTL window, the original response is
 *   replayed with an `X-Idempotent-Replayed: true` header.
 * - On a miss, the response is captured and persisted with a 24h expiry.
 * - When the header is absent, the request proceeds unchanged but an audit
 *   entry is written flagging the missing key.
 */
export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const rawKey = req.header('Idempotency-Key');
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';

  if (!key) {
    // Missing key is not an error, but must be flagged in the audit log.
    void insertAuditEntry({
      action: 'collateral.register.missing_idempotency_key',
      actor: (req as Request & { user?: { id?: string } }).user?.id ?? null,
      metadata: {
        method: req.method,
        path: req.originalUrl || req.path,
        flagged: 'missing_idempotency_key',
      },
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('Failed to write audit entry for missing idempotency key:', err);
    });
    next();
    return;
  }

  const requestHash = computeRequestHash(req);

  findIdempotencyRow(key)
    .then((existing) => {
      if (existing) {
        if (existing.request_hash !== requestHash) {
          res.status(422).json({
            error: 'Idempotency key reused with a different request payload',
          });
          return;
        }
        res.setHeader('X-Idempotent-Replayed', 'true');
        res.status(existing.status);
        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(existing.body);
        } catch {
          parsedBody = existing.body;
        }
        res.json(parsedBody);
        return;
      }

      // Wrap res.json to capture and persist the outgoing response.
      const originalJson = res.json.bind(res);
      let persisted = false;

      res.json = function patchedJson(body: unknown): Response {
        if (!persisted) {
          persisted = true;
          const status = res.statusCode;
          // Only persist successful (2xx) responses; failures should be retryable.
          if (status >= 200 && status < 300) {
            void persistIdempotencyRow(key, requestHash, status, body).catch((err: unknown) => {
              // eslint-disable-next-line no-console
              console.error('Failed to persist idempotency response:', err);
            });
          }
        }
        return originalJson(body);
      };

      next();
    })
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('Idempotency lookup failed:', err);
      res.status(500).json({ error: 'Idempotency check failed' });
    });
}

export default idempotencyMiddleware;