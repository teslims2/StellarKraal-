/**
 * API v2 router (ADR-011).
 *
 * Mounts the GraphQL endpoint at /api/v2/graphql (closes #1537).
 * All other /api/v2/* paths return 501 until they are implemented.
 */
import { Router, Request, Response } from 'express';
import express from 'express';
import { createGraphQLMiddleware } from '../graphql/server';
import { jwtMiddleware } from '../middleware/auth';
import logger from '../utils/logger';

export const v2Router = Router();

// Add API-Version header to all v2 responses
v2Router.use((_req: Request, res: Response, next) => {
  res.setHeader('API-Version', '2');
  next();
});

// ── GraphQL endpoint ──────────────────────────────────────────────────────────
// Mounted at /api/v2/graphql
// JWT middleware guards all POST operations (queries and mutations).
// GET is allowed unauthenticated so the Apollo Sandbox can load the schema.
(async () => {
  try {
    const { middleware } = await createGraphQLMiddleware();
    v2Router.use('/graphql', express.json(), jwtMiddleware, middleware as any);
    logger.info('GraphQL API v2 endpoint mounted at /api/v2/graphql');
  } catch (err) {
    logger.error('Failed to mount GraphQL API v2 endpoint', { error: (err as Error).message });
  }
})();

// ── Catch-all stub for unimplemented v2 routes ────────────────────────────────
// Express 5 / path-to-regexp v8 syntax: use /:path{0,} for optional catch-all
v2Router.all(['/', '/:path{0,}'], (req: Request, res: Response) => {
  // Don't intercept /graphql — handled above
  if (req.path.startsWith('/graphql')) return;
  res.status(501).json({
    error: 'Not Implemented',
    message: 'This API v2 endpoint is not yet available. Use /api/v1 endpoints.',
  });
});
