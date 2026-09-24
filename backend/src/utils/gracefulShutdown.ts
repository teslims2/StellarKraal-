import { Server } from 'http';
import logger from './logger';
import { pool } from './connectionPool';

/**
 * Graceful shutdown manager for HTTP server and in-flight requests.
 * Implements request draining with configurable timeout.
 */

let isShuttingDown = false;
let inFlightRequests = 0;

export function isServerShuttingDown(): boolean {
  return isShuttingDown;
}

export function incrementInFlightRequests(): void {
  inFlightRequests++;
}

export function decrementInFlightRequests(): void {
  inFlightRequests--;
}

export function getInFlightRequestCount(): number {
  return inFlightRequests;
}

/**
 * Initiates graceful shutdown of the HTTP server.
 * 1. Stops accepting new connections
 * 2. Waits up to SHUTDOWN_TIMEOUT_MS for in-flight requests to complete
 * 3. Closes database connections and background jobs
 * 4. Exits with code 0 on success or 1 on timeout/error
 *
 * @param httpServer Express HTTP server instance
 * @param shutdownTimeoutMs Timeout in milliseconds (should be >= 1000)
 * @param onShutdownComplete Optional callback before exit (for cleanup hooks)
 * @param healthFactorTask Optional health factor job to stop
 */
export async function gracefulShutdown(
  httpServer: Server,
  shutdownTimeoutMs: number,
  onShutdownComplete?: () => Promise<void>,
  healthFactorTask?: { stop: () => void }
): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, ignoring signal');
    return;
  }

  isShuttingDown = true;
  logger.info('Starting graceful shutdown...', {
    shutdownTimeoutMs,
    inFlightRequests,
  });

  // Stop accepting new connections immediately
  httpServer.close(() => {
    logger.info('HTTP server closed, no longer accepting new connections');
  });

  // Prevent new connections from being accepted
  httpServer.closeAllConnections?.();

  // Set a timeout to force shutdown if graceful shutdown takes too long
  const forceShutdownTimer = setTimeout(() => {
    logger.error('Graceful shutdown timeout exceeded, forcing exit', {
      timeoutMs: shutdownTimeoutMs,
      inFlightRequests,
    });
    process.exit(1);
  }, shutdownTimeoutMs);

  try {
    // Wait for in-flight requests to complete (with polling)
    await waitForInFlightRequests(shutdownTimeoutMs);

    logger.info('All in-flight requests completed', {
      finalInFlightCount: inFlightRequests,
    });

    // Close database connections
    pool.close();
    logger.info('Database connection pool closed');

    // Stop background jobs
    if (healthFactorTask?.stop) {
      healthFactorTask.stop();
      logger.info('Health factor job stopped');
    }

    // Run any custom cleanup hooks
    if (onShutdownComplete) {
      await onShutdownComplete();
      logger.info('Custom shutdown cleanup completed');
    }

    clearTimeout(forceShutdownTimer);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
}

/**
 * Waits for all in-flight requests to complete, polling at regular intervals.
 * Throws an error if timeout is exceeded.
 *
 * @param timeoutMs Maximum time to wait in milliseconds
 */
async function waitForInFlightRequests(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (inFlightRequests === 0) {
        clearInterval(checkInterval);
        resolve();
      } else {
        const elapsed = Date.now() - startTime;
        if (elapsed >= timeoutMs) {
          clearInterval(checkInterval);
          reject(
            new Error(
              `Timeout waiting for in-flight requests (${inFlightRequests} remaining after ${elapsed}ms)`
            )
          );
        } else {
          logger.info('Waiting for in-flight requests to complete', {
            inFlightRequests,
            elapsedMs: elapsed,
            timeoutMs,
          });
        }
      }
    }, 1000);
  });
}

/**
 * Register signal handlers for graceful shutdown.
 *
 * @param httpServer Express HTTP server instance
 * @param shutdownTimeoutMs Timeout in milliseconds
 * @param onShutdownComplete Optional callback before exit
 * @param healthFactorTask Optional health factor job to stop
 */
export function registerSignalHandlers(
  httpServer: Server,
  shutdownTimeoutMs: number,
  onShutdownComplete?: () => Promise<void>,
  healthFactorTask?: { stop: () => void }
): void {
  const handleSignal = (signal: string) => {
    logger.info(`Received ${signal}, initiating graceful shutdown`);
    gracefulShutdown(httpServer, shutdownTimeoutMs, onShutdownComplete, healthFactorTask);
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    handleSignal('uncaughtException');
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    handleSignal('unhandledRejection');
  });
}
