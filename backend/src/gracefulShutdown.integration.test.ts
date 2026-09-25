import request from 'supertest';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import {
  gracefulShutdown,
  registerSignalHandlers,
  isServerShuttingDown,
  getInFlightRequestCount,
} from './utils/gracefulShutdown';
import { requestDrainingMiddleware } from './middleware/requestDraining';
import { shutdownGuardMiddleware } from './middleware/shutdownGuard';

describe('Graceful Shutdown Integration', () => {
  let app: express.Application;
  let server: Server;
  const SHUTDOWN_TIMEOUT_MS = 5000;

  beforeEach(() => {
    app = express();

    // Apply middleware
    app.use(requestDrainingMiddleware);
    app.use(shutdownGuardMiddleware);

    // Test routes
    app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    // Slow endpoint that takes time to complete
    app.get('/slow', (req: Request, res: Response) => {
      setTimeout(() => {
        res.json({ message: 'completed slowly' });
      }, 1000);
    });

    // Very slow endpoint that exceeds timeout
    app.get('/very-slow', (req: Request, res: Response) => {
      setTimeout(() => {
        res.json({ message: 'this should not complete' });
      }, 10000);
    });

    server = app.listen(0); // Use random port
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      if (server && server.listening) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  it('should track in-flight requests and allow them to drain', async () => {
    const port = (server.address() as any).port;

    // Start a slow request
    const slowRequestPromise = request(`http://localhost:${port}`)
      .get('/slow')
      .expect(200);

    // Give the request time to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify request is in-flight
    const inFlightBefore = getInFlightRequestCount();
    expect(inFlightBefore).toBeGreaterThan(0);

    // Trigger graceful shutdown
    gracefulShutdown(server, SHUTDOWN_TIMEOUT_MS, undefined, undefined);

    // The in-flight request should complete
    const response = await slowRequestPromise;
    expect(response.body).toEqual({ message: 'completed slowly' });

    // After drain completes, in-flight count should be 0
    await new Promise((resolve) => setTimeout(resolve, 100));
    const inFlightAfter = getInFlightRequestCount();
    expect(inFlightAfter).toBe(0);
  });

  it('should reject new requests during shutdown', async () => {
    const port = (server.address() as any).port;

    // Start graceful shutdown
    const shutdownPromise = gracefulShutdown(
      server,
      SHUTDOWN_TIMEOUT_MS,
      undefined,
      undefined
    );

    // Give shutdown a moment to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    // New requests should be rejected with 503
    const response = await request(`http://localhost:${port}`)
      .get('/health')
      .expect(503);

    expect(response.body.error).toBe('Service Unavailable');
    expect(response.body.message).toContain('shutting down');
    expect(response.get('Retry-After')).toBe('10');

    await shutdownPromise;
  });

  it('should exit with code 1 if shutdown times out', async () => {
    const port = (server.address() as any).port;

    // Exit spy to capture process.exit calls
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      // Start a very slow request that will exceed timeout
      const verySlowRequestPromise = request(`http://localhost:${port}`)
        .get('/very-slow')
        .catch(() => {}); // Request may fail due to shutdown

      // Give the request time to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Trigger graceful shutdown with short timeout
      const shortTimeout = 500;
      const shutdownPromise = gracefulShutdown(
        server,
        shortTimeout,
        undefined,
        undefined
      ).catch(() => {}); // Expected to fail due to timeout

      // Wait for shutdown to timeout
      await new Promise((resolve) => setTimeout(resolve, shortTimeout + 500));

      // Verify process.exit was called with code 1
      expect(exitSpy).toHaveBeenCalledWith(1);

      await shutdownPromise;
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('should set isServerShuttingDown flag', async () => {
    const port = (server.address() as any).port;

    expect(isServerShuttingDown()).toBe(false);

    // Start graceful shutdown
    const shutdownPromise = gracefulShutdown(
      server,
      SHUTDOWN_TIMEOUT_MS,
      undefined,
      undefined
    );

    // Flag should be set immediately
    expect(isServerShuttingDown()).toBe(true);

    // Give it time to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    await shutdownPromise;
  });

  it('should ignore repeated shutdown signals', async () => {
    const port = (server.address() as any).port;

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      // First shutdown
      const firstShutdown = gracefulShutdown(
        server,
        SHUTDOWN_TIMEOUT_MS,
        undefined,
        undefined
      ).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second shutdown (should be ignored)
      const secondShutdown = gracefulShutdown(
        server,
        SHUTDOWN_TIMEOUT_MS,
        undefined,
        undefined
      ).catch(() => {});

      await Promise.all([firstShutdown, secondShutdown]);

      // Should have exited only once
      expect(exitSpy.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('should drain multiple concurrent in-flight requests', async () => {
    const port = (server.address() as any).port;

    // Start multiple slow requests
    const requests = [
      request(`http://localhost:${port}`).get('/slow'),
      request(`http://localhost:${port}`).get('/slow'),
      request(`http://localhost:${port}`).get('/slow'),
    ];

    // Give requests time to start
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify multiple requests are in-flight
    const inFlightBefore = getInFlightRequestCount();
    expect(inFlightBefore).toBeGreaterThanOrEqual(2);

    // Trigger graceful shutdown
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      const shutdownPromise = gracefulShutdown(
        server,
        SHUTDOWN_TIMEOUT_MS,
        undefined,
        undefined
      ).catch(() => {});

      // All requests should complete
      const responses = await Promise.all(requests.map((r) => r.catch(() => null)));

      // All that completed should be successful
      const successfulResponses = responses.filter((r) => r && r.status === 200);
      expect(successfulResponses.length).toBeGreaterThan(0);

      await shutdownPromise;
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('should close HTTP server and reject new connections', async () => {
    const port = (server.address() as any).port;

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      // Trigger graceful shutdown
      const shutdownPromise = gracefulShutdown(
        server,
        SHUTDOWN_TIMEOUT_MS,
        undefined,
        undefined
      ).catch(() => {});

      // Give server time to close
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Server should be closed
      expect(server.listening).toBe(false);

      await shutdownPromise;
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('should execute custom cleanup callback before exit', async () => {
    const port = (server.address() as any).port;
    const cleanupCallback = jest.fn().mockResolvedValue(undefined);

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      // Trigger graceful shutdown with cleanup callback
      const shutdownPromise = gracefulShutdown(
        server,
        SHUTDOWN_TIMEOUT_MS,
        cleanupCallback,
        undefined
      ).catch(() => {});

      // Give shutdown time to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Cleanup callback should have been called
      expect(cleanupCallback).toHaveBeenCalled();

      await shutdownPromise;
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('should return Retry-After header on shutdown responses', async () => {
    const port = (server.address() as any).port;

    // Start graceful shutdown
    const shutdownPromise = gracefulShutdown(
      server,
      SHUTDOWN_TIMEOUT_MS,
      undefined,
      undefined
    ).catch(() => {});

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Request during shutdown
    const response = await request(`http://localhost:${port}`)
      .get('/health')
      .expect(503);

    // Should include Retry-After header for client retry logic
    expect(response.get('Retry-After')).toBe('10');

    await shutdownPromise;
  });
});
