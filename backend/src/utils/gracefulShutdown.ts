import { Server } from 'http';
import logger from './logger';
import { pool } from './connectionPool';
import config from '../config';

/**
 * Graceful shutdown manager for HTTP server and in-flight requests.
 * Implements request draining with configurable timeout.
 */

let isShuttingDown = false;
let inFlightRequests = 0;
let signalHandlersRegistered = false;

/**
 * Optional cleanup hooks that must be flushed before the process exits.
 * These are wired up by registerSignalHandlers so that the event listener
 * and webhook retry service can drain their queues during shutdown.
 */
export interface ShutdownHooks {
  /** Stops the contract event listener and flushes any pending events. */
  stopEventListener?: () => Promise<void> | void;
  /** Flushes the webhook retry queue and stops the retry worker. */
  flushWebhookQueue?: () => Promise<void> | void;
  /** Stops background jobs (e.g. health factor task). */
  stopBackgroundJobs?: () => Promise<void> | void;
  /** Any additional custom cleanup. */
  onShutdownComplete?: () => Promise<void> | void;
}

export interface RegisterSignalHandlersOptions extends ShutdownHooks {
  /** Overrides config.SHUTDOWN_TIMEOUT_MS when provided. */
  shutdownTimeoutMs?: number;
}

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
 * 1. Sets the draining flag so shutdownGuardMiddleware rejects new work with 503
 * 2. Stops accepting new connections (httpServer.close)
 * 3. Waits up to SHUTDOWN_TIMEOUT_MS for in-flight requests to complete
 * 4. Flushes the event listener and webhook queue
 * 5. Closes database connections and background jobs
 * 6. Exits with code 0 on success or 1 on timeout/error
 *
 * Note: closeAllConnections() is intentionally NOT called before draining,
 * because it would abort in-flight requests.
 *
 * @param httpServer Express HTTP server instance
 * @param shutdownTimeoutMs Timeout in milliseconds (should be >= 1000)
 * @param hooks Optional cleanup hooks (event listener, webhook queue, etc.)
 */
export async function gracefulShutdown(
  httpServer: Server,
  shutdownTimeoutMs: number,
  hooks: ShutdownHooks = {}
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

  // Stop accepting new connections immediately. Existing connections
  // (and therefore in-flight requests) are allowed to finish.
  httpServer.close((err) => {
    if (err) {
      logger.error('Error closing HTTP server', {
        error: err instanceof Error ? err.message : String(err),
      });
    } else {
      logger.info('HTTP server closed, no longer accepting new connections');
    }
  });

  // Set a timeout to force shutdown if graceful shutdown takes too long
  const forceShutdownTimer = setTimeout(() => {
    logger.error('Graceful shutdown timeout exceeded, forcing exit', {
      timeoutMs: shutdownTimeoutMs,
      inFlightRequests,
    });
    // Only now is it safe to abort any remaining connections.
    httpServer.closeAllConnections?.();
    process.exit(1);
  }, shutdownTimeoutMs);
  // Do not keep the event loop alive solely because of this timer.
  if (typeof forceShutdownTimer.unref === 'function') {
    forceShutdownTimer.unref();
  }

  try {
    // Wait for in-flight requests to complete (with polling)
    await waitForInFlightRequests(shutdownTimeoutMs);

    logger.info('All in-flight requests completed', {
      finalInFlightCount: inFlightRequests,
    });

    // Flush the contract event listener before shutting down the DB pool.
    if (hooks.stopEventListener) {
      await hooks.stopEventListener();
      logger.info('Contract event listener stopped and flushed');
    }

    // Flush the webhook retry queue.
    if (hooks.flushWebhookQueue) {
      await hooks.flushWebhookQueue();
      logger.info('Webhook queue flushed');
    }

    // Stop background jobs
    if (hooks.stopBackgroundJobs) {
      await hooks.stopBackgroundJobs();
      logger.info('Background jobs stopped');
    }

    // Run any custom cleanup hooks
    if (hooks.onShutdownComplete) {
      await hooks.onShutdownComplete();
      logger.info('Custom shutdown cleanup completed');
    }

    // Close database connections last, once all work has drained.
    pool.close();
    logger.info('Database connection pool closed');

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
 * This is idempotent: calling it more than once (e.g. from multiple startup
 * paths) will not attach duplicate listeners. The first server passed in wins.
 *
 * @param httpServer Express HTTP server instance
 * @param opts Shutdown hooks and optional timeout override
 */
export function registerSignalHandlers(
  httpServer: Server,
  opts: RegisterSignalHandlersOptions = {}
): void {
  if (signalHandlersRegistered) {
    logger.warn('Signal handlers already registered, ignoring duplicate registration');
    return;
  }
  signalHandlersRegistered = true;

  const shutdownTimeoutMs =
    typeof opts.shutdownTimeoutMs === 'number' && opts.shutdownTimeoutMs > 0
      ? opts.shutdownTimeoutMs
      : config.SHUTDOWN_TIMEOUT_MS;

  const hooks: ShutdownHooks = {
    stopEventListener: opts.stopEventListener,
    flushWebhookQueue: opts.flushWebhookQueue,
    stopBackgroundJobs: opts.stopBackgroundJobs,
    onShutdownComplete: opts.onShutdownComplete,
  };

  const handleSignal = (signal: string) => {
    logger.info(`Received ${signal}, initiating graceful shutdown`);
    void gracefulShutdown(httpServer, shutdownTimeoutMs, hooks);
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

/**
 * Test-only helper to reset module state between test runs.
 * Not intended for production use.
 */
export function __resetGracefulShutdownStateForTests(): void {
  isShuttingDown = false;
  inFlightRequests = 0;
  signalHandlersRegistered = false;
}
