import { Request, Response, NextFunction } from 'express';
import {
  incrementInFlightRequests,
  decrementInFlightRequests,
} from '../utils/gracefulShutdown';

/**
 * Middleware that tracks in-flight requests during server lifecycle.
 * Increments counter on request entry, decrements on response finish.
 * Used to implement graceful shutdown with proper request draining.
 */
export function requestDrainingMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  incrementInFlightRequests();

  // Decrement counter when response finishes
  res.on('finish', () => {
    decrementInFlightRequests();
  });

  // Also handle error cases where finish may not fire
  res.on('close', () => {
    // Only decrement if response hasn't finished yet
    // (finish event fires before close, so this handles premature closes)
    if (!res.headersSent) {
      decrementInFlightRequests();
    }
  });

  next();
}
