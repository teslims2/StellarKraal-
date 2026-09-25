import { Request, Response, NextFunction } from 'express';
import { isServerShuttingDown } from '../utils/gracefulShutdown';

/**
 * Middleware that rejects new requests during graceful shutdown.
 * Returns 503 Service Unavailable with Retry-After header.
 * Allows existing in-flight requests to drain.
 */
export function shutdownGuardMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (isServerShuttingDown()) {
    res.set('Retry-After', '10');
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Server is shutting down. Please retry shortly.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}
