/**
 * Audit logging middleware.
 *
 * Threat model (production PII masking):
 *   - Wallet addresses (Stellar G... keys) are masked to first4+last4 to prevent
 *     PII exposure in log aggregation pipelines and log storage systems.
 *   - JWT tokens are fully redacted to prevent session hijacking via log access.
 *   - Loan amounts are financial data, not PII, and are retained for audit purposes.
 *   - PII fields (national ID, phone, account number) are always redacted regardless
 *     of NODE_ENV to prevent PII leakage in any environment.
 *   - Additional fields can be added via the AUDIT_REDACT_FIELDS env var
 *     (comma-separated list of lowercase field names).
 *   - Every log entry includes the authenticated user ID (or "anonymous").
 */
import { Request, Response, NextFunction } from "express";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import { config } from "../config";

// ── Sensitive fields to redact ────────────────────────────────────────────────

/**
 * Base set of sensitive field names (lowercased).
 * Matched case-insensitively at redaction time.
 */
const BASE_REDACTED_FIELDS = new Set([
  // Auth / credentials
  "password", "secret", "private_key", "privatekey", "seed",
  "mnemonic", "token", "authorization", "api_key", "apikey",
  "secret_key", "secretkey", "signing_key", "signingkey",
  "refreshtoken",
  // PII — always redacted regardless of environment
  "national_id", "nationalid", "national_id_number", "nationalidnumber",
  "phone", "phone_number", "phonenumber", "mobile", "mobile_number",
  "account_number", "accountnumber", "account_no", "accountno",
]);

/**
 * Build the final redact-field set by merging the base set with any extra
 * fields supplied via AUDIT_REDACT_FIELDS (comma-separated, lowercased).
 */
function buildRedactedFields(): Set<string> {
  const extra = (config.AUDIT_REDACT_FIELDS ?? "")
    .split(",")
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);
  return extra.length > 0
    ? new Set([...BASE_REDACTED_FIELDS, ...extra])
    : BASE_REDACTED_FIELDS;
}

// Re-evaluated each time the module is first loaded (once per process).
// To update at runtime, call configureRedactFields().
let REDACTED_FIELDS: Set<string> = buildRedactedFields();

/**
 * Extend the runtime redact list with additional field names.
 * Useful for tests and dynamic reconfiguration without restarting the process.
 * @param fields - Lowercase field names to add to the redact list.
 */
export function configureRedactFields(fields: string[]): void {
  REDACTED_FIELDS = new Set([...REDACTED_FIELDS, ...fields.map((f) => f.toLowerCase())]);
}

/**
 * Reset the redact list back to the env-configured default.
 * Intended for use in tests only.
 */
export function _resetRedactFields(): void {
  REDACTED_FIELDS = buildRedactedFields();
}

/** Stellar public key pattern: G followed by 55 base32 characters. */
const STELLAR_PUBKEY_RE = /\bG[A-Z2-7]{55}\b/g;

/** JWT pattern: three base64url segments separated by dots. */
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

/**
 * Mask a Stellar public key to first 4 + last 4 characters.
 * e.g. GABC...WXYZ
 * @param key - Full Stellar public key string.
 * @returns Masked key string.
 */
function maskWalletAddress(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Apply PII masking to a string value in production:
 *   - Stellar wallet addresses → first4...last4
 *   - JWT tokens → [REDACTED]
 * No-op outside production.
 * @param value - String to scan and mask.
 * @returns Masked string.
 */
function maskString(value: string): string {
  if (process.env.NODE_ENV !== "production") return value;
  return value
    .replace(STELLAR_PUBKEY_RE, (match) => maskWalletAddress(match))
    .replace(JWT_RE, "[REDACTED]");
}

/**
 * Recursively redact sensitive fields from a plain object.
 * In production, also masks wallet addresses and JWT tokens in string values.
 * PII fields (national ID, phone, account number) are always redacted.
 * @param obj - The value to redact.
 * @param depth - Current recursion depth (stops at 5).
 * @returns A new object with sensitive field values replaced by `"[REDACTED]"`.
 */
export function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== "object") {
    if (typeof obj === "string") return maskString(obj);
    return obj;
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_FIELDS.has(k.toLowerCase())) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = redact(v, depth + 1);
    }
  }
  return result;
}

// ── Audit log transport (separate file with 30-day rotation) ──────────────────
const LOG_DIR = config.AUDIT_LOG_DIR ?? path.join(process.cwd(), "logs");

const auditTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: "audit-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "30d",
  zippedArchive: true,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
});

const auditLogger = winston.createLogger({
  level: "info",
  transports: [auditTransport],
  // Also write to console in non-production for visibility
  ...(process.env.NODE_ENV !== "production" && {
    transports: [
      auditTransport,
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: "HH:mm:ss" }),
          winston.format.printf(
            ({ timestamp, message, ...m }) =>
              `${timestamp} [AUDIT] ${message} ${JSON.stringify(m)}`
          )
        ),
      }),
    ],
  }),
});

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Resolve the authenticated user ID from the request.
 * Returns the Stellar public key when a JWT or API key is present,
 * or the string "anonymous" for unauthenticated requests.
 */
function resolveUserId(req: Request): string {
  const user = (req as Request & { user?: { publicKey?: unknown } }).user;
  if (user && typeof user.publicKey === "string" && user.publicKey.length > 0) {
    return user.publicKey;
  }
  return "anonymous";
}

/**
 * Express middleware that logs each request to the audit log.
 * Every entry includes:
 *   - userId: authenticated user (Stellar public key) or "anonymous"
 *   - method, path, status, durationMs, ip, requestId
 *   - body (non-GET only): redacted copy of request body
 * In production, wallet addresses in string values are masked and JWT tokens
 * are fully redacted.
 * @param req - Express request object.
 * @param res - Express response object.
 * @param next - Next middleware callback.
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

    auditLogger.info("api_request", {
      requestId: (req as any).requestId,
      userId: resolveUserId(req),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      body: req.method !== "GET" ? redact(req.body) : undefined,
      ip: req.ip,
    });
  });

  next();
}

export { auditLogger, BASE_REDACTED_FIELDS };
