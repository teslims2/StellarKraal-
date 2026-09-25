/**
 * Centralized error codes and HTTP status code mappings for all API responses.
 * Maps application error codes to HTTP status codes per docs/api-error-codes.md
 */

export enum ErrorCode {
  // General
  INTERNAL_ERROR = "INTERNAL_ERROR",

  // Authentication & Authorization
  MISSING_TOKEN = "MISSING_TOKEN",
  INVALID_TOKEN = "INVALID_TOKEN",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  MISSING_HEADER = "MISSING_HEADER",
  INVALID_API_KEY = "INVALID_API_KEY",
  AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED",
  FORBIDDEN = "FORBIDDEN",

  // Validation
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_PAGINATION = "INVALID_PAGINATION",

  // Resources
  NOT_FOUND = "NOT_FOUND",
  COLLATERAL_NOT_FOUND = "COLLATERAL_NOT_FOUND",
  LOAN_NOT_FOUND = "LOAN_NOT_FOUND",
  OWNERSHIP_MISMATCH = "OWNERSHIP_MISMATCH",
  ALREADY_PLEDGED = "ALREADY_PLEDGED",

  // Business Logic
  HEALTH_FACTOR_SAFE = "HEALTH_FACTOR_SAFE",
  LOAN_ALREADY_CLOSED = "LOAN_ALREADY_CLOSED",
  INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION",

  // Soroban / Contract Errors
  CONTRACT_NOT_INITIALIZED = "CONTRACT_NOT_INITIALIZED",
  CONTRACT_ALREADY_INITIALIZED = "CONTRACT_ALREADY_INITIALIZED",
  UNAUTHORIZED = "UNAUTHORIZED",
  INSUFFICIENT_COLLATERAL = "INSUFFICIENT_COLLATERAL",
  INVALID_AMOUNT = "INVALID_AMOUNT",
  INVALID_FEE_RATE = "INVALID_FEE_RATE",
  EXCEEDS_CLOSE_FACTOR = "EXCEEDS_CLOSE_FACTOR",
  INVALID_CLOSE_FACTOR = "INVALID_CLOSE_FACTOR",
  CONTRACT_PAUSED = "CONTRACT_PAUSED",
  ORACLE_ALREADY_REGISTERED = "ORACLE_ALREADY_REGISTERED",
  ORACLE_LIMIT_REACHED = "ORACLE_LIMIT_REACHED",
  ORACLE_NOT_FOUND = "ORACLE_NOT_FOUND",
  INSUFFICIENT_ORACLE_QUORUM = "INSUFFICIENT_ORACLE_QUORUM",
  INVALID_PRICE = "INVALID_PRICE",
  NOT_PAUSED = "NOT_PAUSED",
  REENTRANCY_GUARD = "REENTRANCY_GUARD",
  ALREADY_PAUSED = "ALREADY_PAUSED",
  ARITHMETIC_OVERFLOW = "ARITHMETIC_OVERFLOW",
  LIQUIDATOR_NOT_WHITELISTED = "LIQUIDATOR_NOT_WHITELISTED",
  NO_UPGRADE_PENDING = "NO_UPGRADE_PENDING",
  TIMELOCK_NOT_ELAPSED = "TIMELOCK_NOT_ELAPSED",
  ORACLE_REQUIRED = "ORACLE_REQUIRED",

  // Rate Limiting
  RATE_LIMITED = "RATE_LIMITED",

  // Infrastructure
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  BAD_GATEWAY = "BAD_GATEWAY",
  IDEMPOTENCY_KEY_REQUIRED = "IDEMPOTENCY_KEY_REQUIRED",
}

/**
 * Maps error codes to HTTP status codes.
 * Used by errorHandler middleware to determine response status.
 */
export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  [ErrorCode.INTERNAL_ERROR]: 500,

  // Authentication & Authorization
  [ErrorCode.MISSING_TOKEN]: 400,
  [ErrorCode.INVALID_TOKEN]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.INVALID_SIGNATURE]: 401,
  [ErrorCode.MISSING_HEADER]: 401,
  [ErrorCode.INVALID_API_KEY]: 401,
  [ErrorCode.AUTHENTICATION_REQUIRED]: 401,
  [ErrorCode.FORBIDDEN]: 403,

  // Validation
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_PAGINATION]: 400,

  // Resources
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.COLLATERAL_NOT_FOUND]: 404,
  [ErrorCode.LOAN_NOT_FOUND]: 404,
  [ErrorCode.OWNERSHIP_MISMATCH]: 400,
  [ErrorCode.ALREADY_PLEDGED]: 409,

  // Business Logic
  [ErrorCode.HEALTH_FACTOR_SAFE]: 400,
  [ErrorCode.LOAN_ALREADY_CLOSED]: 409,
  [ErrorCode.INVALID_STATE_TRANSITION]: 400,

  // Soroban / Contract Errors
  [ErrorCode.CONTRACT_NOT_INITIALIZED]: 502,
  [ErrorCode.CONTRACT_ALREADY_INITIALIZED]: 502,
  [ErrorCode.UNAUTHORIZED]: 403,
  [ErrorCode.INSUFFICIENT_COLLATERAL]: 400,
  [ErrorCode.INVALID_AMOUNT]: 400,
  [ErrorCode.INVALID_FEE_RATE]: 400,
  [ErrorCode.EXCEEDS_CLOSE_FACTOR]: 400,
  [ErrorCode.INVALID_CLOSE_FACTOR]: 400,
  [ErrorCode.CONTRACT_PAUSED]: 503,
  [ErrorCode.ORACLE_ALREADY_REGISTERED]: 409,
  [ErrorCode.ORACLE_LIMIT_REACHED]: 409,
  [ErrorCode.ORACLE_NOT_FOUND]: 404,
  [ErrorCode.INSUFFICIENT_ORACLE_QUORUM]: 502,
  [ErrorCode.INVALID_PRICE]: 400,
  [ErrorCode.NOT_PAUSED]: 400,
  [ErrorCode.REENTRANCY_GUARD]: 502,
  [ErrorCode.ALREADY_PAUSED]: 400,
  [ErrorCode.ARITHMETIC_OVERFLOW]: 500,
  [ErrorCode.LIQUIDATOR_NOT_WHITELISTED]: 403,
  [ErrorCode.NO_UPGRADE_PENDING]: 400,
  [ErrorCode.TIMELOCK_NOT_ELAPSED]: 400,
  [ErrorCode.ORACLE_REQUIRED]: 400,

  // Rate Limiting
  [ErrorCode.RATE_LIMITED]: 429,

  // Infrastructure
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.BAD_GATEWAY]: 502,
  [ErrorCode.IDEMPOTENCY_KEY_REQUIRED]: 400,
};

/**
 * Get HTTP status code for error code.
 * Defaults to 500 if code not found.
 */
export function getStatusCode(code: ErrorCode): number {
  return ERROR_STATUS_MAP[code] ?? 500;
}

/**
 * Type for validation error details.
 * Each field maps to an array of error messages.
 */
export interface ValidationDetails {
  [field: string]: string[];
}

/**
 * Standard error response body format.
 */
export interface StandardErrorResponse {
  code: ErrorCode;
  message: string;
  correlationId: string;
  details?: ValidationDetails | Record<string, unknown>;
}
