import { Request, Response, NextFunction } from 'express';
import {
  incrementInFlightRequests,
  decrementInFlightRequests,
} from '../utils/gracefulShutdown';

/**
 * Middleware that tracks in-flight requests during server lifecycle.
 * Increments counter on request entry, decrements on response finish.
 * Used to implement graceful shutdown with proper request draining.
 *
 * The decrement is guarded by a per-response flag so it happens exactly
 * once, whether the response finishes normally or the connection closes
 * prematurely. This prevents the drain wait in gracefulShutdown from
 * hanging (double-increment / missed decrement) or finishing early
 * (double-decrement).
 *
 * Requests rejected by the shutdown guard are not counted as in-flight:
 * the guard responds with 503 and sets `res.locals.shutdownRejected`, in
 * which case we skip incrementing the counter.
 */
export function requestDrainingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Requests rejected by the shutdown guard are not in-flight work that
  // needs draining; skip counting them entirely.
  if (res.locals && res.locals.shutdownRejected) {
    next();
    return;
  }

  incrementInFlightRequests();

  let decremented = false;
  const decrementOnce = (): void => {
    if (decremented) {
      return;
    }
    decremented = true;
    decrementInFlightRequests();
  };

  // Decrement counter when response finishes
  res.on('finish', decrementOnce);

  // Also handle error cases where finish may not fire
  // (finish event fires before close, so this handles premature closes)
  res.on('close', decrementOnce);

  next();
}