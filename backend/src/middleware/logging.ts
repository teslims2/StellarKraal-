import { Request, Response, NextFunction } from "express";
import logger, { createRequestLogger } from "../utils/logger";

/**
 * Logs each completed HTTP request with method, path, status code, duration,
 * and correlation ID so entries for a single request can be grouped in
 * centralised log aggregation tools.  Resolves issue #1529.
 *
 * @param req - Express request object.
 * @param res - Express response object.
 * @param next - Express next function.
 */
export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const reqLogger = req.logger ?? (req.requestId ? createRequestLogger(req.requestId) : logger);

  res.on("finish", () => {
    reqLogger.info("request completed", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startTime,
      correlationId: (req as any).correlationId ?? (req as any).requestId,
    });
  });

  next();
}
