import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { runWithCorrelationId } from "../utils/correlationContext";

declare module "express-serve-static-core" {
  interface Request {
    correlationId: string;
  }
}

/**
 * Express middleware that attaches a correlation ID to every request.
 *
 * - Honours the incoming `X-Correlation-ID` header when present so clients can
 *   propagate their own trace identifiers end-to-end.
 * - Generates a fresh UUID otherwise.
 * - Sets the `X-Correlation-ID` response header so callers can reference the
 *   same identifier when filing support requests.
 * - Runs the rest of the request inside an AsyncLocalStorage context keyed by
 *   the correlation ID so every logger call downstream automatically includes
 *   it without needing to thread the value through every function call.
 *
 * Resolves issue #1529.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-correlation-id"];
  const correlationId =
    (typeof incoming === "string" && incoming.trim().length > 0 ? incoming.trim() : null) ??
    randomUUID();

  req.correlationId = correlationId;
  res.setHeader("X-Correlation-ID", correlationId);

  runWithCorrelationId(correlationId, next);
}
