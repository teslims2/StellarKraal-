/**
 * API v1 router — all application routes are mounted here.
 * Accessed via /api/v1/...
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { pool } from '../utils/connectionPool';
import { invalidateAll } from '../utils/appraisalCache';
import { asyncHandler } from '../utils/asyncHandler';
import {
  registerWebhook,
  getWebhooks,
  getDeliveryLogs,
  deleteWebhook,
  replayDeadLetterWebhooks,
} from '../webhooks';
import { timeoutMiddleware } from '../middleware/timeout';
import { writeLimiter, readLimiter } from '../middleware/rateLimit';
import rateLimit from 'express-rate-limit';
import { deprecationHeadersWhen } from '../middleware/deprecation';
import { fireAlert } from '../utils/alerting';
import { rules } from '../utils/alertRules';
import rpcClient from '../utils/rpcClient';
import { healthRouter } from './health';
import { loanRepaymentRouter } from './loanRepayment';
import {
  registerCollateralSchema,
  registerCollateral,
  batchRegisterCollateralSchema,
  batchRegisterCollateral,
  getCollateralById,
} from '../services/collateralService';
import { getProfile, updateProfile, insertAuditEntry, listCollateral, listLoans, getLoan, getTransaction } from '../db/store';
import { updateProfileSchema } from '../validators/profile';
import { validate } from '../middleware/validate';
import { auditMiddleware, redact, auditLogger } from '../middleware/audit';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { etagMiddleware } from '../utils/etag';
import {
  loanRequestSchema,
  loanRepaySchema,
  loanLiquidateSchema,
  requestLoan,
  repayLoan,
  liquidateLoan,
  getLoanOnChain,
  getHealthFactor,
  listLoansPaginated,
  LoanNotFoundError,
  LoanNotLiquidatableError,
  InvalidPaginationError,
} from '../services/loanService';
const APP_VERSION = process.env['npm_package_version'] || '1.0.0';
const startTime = Date.now();

const settingsSchema = z.object({
  notifications: z
    .object({
      loanApproved: z.boolean(),
      loanRepaid: z.boolean(),
      liquidationWarning: z.boolean(),
    })
    .optional(),
  language: z.string().min(2).max(10).optional(),
  currency: z.string().min(3).max(6).optional(),
});

/**
 * Schema for the notification-preferences PATCH endpoint (issue #1528).
 * Extends the core notification toggles with an optional webhook URL and
 * per-event-type toggle map.
 */
const notificationPreferencesSchema = z.object({
  webhookUrl: z.string().url().nullable().optional(),
  events: z
    .object({
      loanApproved: z.boolean().optional(),
      loanRepaid: z.boolean().optional(),
      liquidationWarning: z.boolean().optional(),
      collateralUpdated: z.boolean().optional(),
      healthFactorAlert: z.boolean().optional(),
    })
    .optional(),
});

type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

type UserSettings = z.infer<typeof settingsSchema> & {
  walletAddress: string;
  joinDate: string;
  notificationPreferences?: NotificationPreferences;
};

const settingsStore = new Map<string, UserSettings>();

const v1Router = Router();

v1Router.use((_req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return originalJson({ api_version: 'v1', ...(body as object) });
    }
    return originalJson(body);
  };
  next();
});

// GET /health/deep — deep infrastructure health check (no auth, no rate limit)
v1Router.use('/health', healthRouter);

// GET /health — shallow liveness check
v1Router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    let rpcReachable = false;
    try {
      await pool.run((s) => s.getHealth());
      rpcReachable = true;
    } catch {
      // degraded
    }
    res.status(rpcReachable ? 200 : 503).json({
      status: rpcReachable ? 'healthy' : 'degraded',
      version: APP_VERSION,
      uptime,
      rpcReachable,
      pool: pool.stats(),
    });
  } catch (err) {
    next(err);
  }
});

v1Router.post(
  '/collateral/register',
  auditMiddleware,
  idempotencyMiddleware,
  timeoutMiddleware(parseInt(config.TIMEOUT_WRITE_MS, 10)),
  writeLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const validation = registerCollateralSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
    }
    const result = await registerCollateral(validation.data);
    res.status(201).json(result);
  })
);

v1Router.post(
  '/collateral/register/batch',
  auditMiddleware,
  idempotencyMiddleware,
  timeoutMiddleware(parseInt(config.TIMEOUT_WRITE_MS, 10)),
  writeLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const validation = batchRegisterCollateralSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
    }
    const result = await batchRegisterCollateral(validation.data);
    res.json(result);
  })
);

v1Router.post(
  '/loan/request',
  auditMiddleware,
  timeoutMiddleware(parseInt(config.TIMEOUT_WRITE_MS, 10)),
  writeLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const validation = loanRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
    }
    const result = await requestLoan(validation.data);
    res.json(result);
  })
);

v1Router.post(
  '/loan/repay',
  auditMiddleware,
  timeoutMiddleware(parseInt(config.TIMEOUT_WRITE_MS, 10)),
  writeLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const validation = loanRepaySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
    }
    const result = await repayLoan(validation.data);
    res.json(result);
  })
);

// Share the locked repayment submission path with the main application.
v1Router.use(loanRepaymentRouter);

v1Router.post(
  '/loan/liquidate',
  auditMiddleware,
  timeoutMiddleware(parseInt(config.TIMEOUT_WRITE_MS, 10)),
  writeLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const validation = loanLiquidateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
    }
    try {
      const result = await liquidateLoan(validation.data);
      res.json(result);
    } catch (err) {
      if (err instanceof LoanNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      if (err instanceof LoanNotLiquidatableError) {
        return res.status(400).json({ error: err.message, health_factor: err.healthFactor });
      }
      throw err;
    }
  })
);

v1Router.get(
  '/loan/:id',
  readLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getLoanOnChain(req.params.id as string);
    res.json(result);
  })
);

v1Router.get(
  '/health/:loanId',
  readLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getHealthFactor(req.params.loanId as string);
    res.json(result);
  })
);

v1Router.get('/collateral/:id', readLimiter, (req: Request, res: Response) => {
  const record = getCollateralById(req.params.id as string);
  if (!record) {
    return res.status(404).json({ error: 'Collateral not found' });
  }
  res.json(record);
});

v1Router.get(
  '/loans',
  readLimiter,
  deprecationHeadersWhen(
    (req) =>
      req.query.page === undefined &&
      req.query.pageSize === undefined &&
      req.query.limit === undefined,
    {
      sunset: new Date('2026-12-31T23:59:59Z'),
      warning: 'Unpaginated loan listing is deprecated; use ?page=1&pageSize=20',
      link: '</api/v1/loans?page=1&pageSize=20>; rel="successor-version"',
    }
  ),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = listLoansPaginated(req.query as Record<string, string | undefined>);
      const body: Record<string, unknown> = {
        data: result.data,
        limit: result.limit,
        pageSize: result.pageSize,
        paginationMode: result.paginationMode,
      };

      if (result.paginationMode === 'cursor') {
        // Cursor mode: omit offset-only fields, expose cursor navigation fields
        body.nextCursor = result.nextCursor ?? null;
        body.hasMore = result.hasMore ?? false;
      } else {
        // Offset mode: include legacy total/page fields
        body.total = result.total;
        body.page = result.page;
        body.nextCursor = null;
        body.hasMore = false;
      }

      res.json(body);
    } catch (err) {
      if (err instanceof InvalidPaginationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
  })
);

v1Router.get('/loans/:id', readLimiter, (req: Request, res: Response) => {
  const loan = getLoan(req.params.id as string);
  if (!loan) {
    return res.status(404).json({ error: 'Loan not found' });
  }
  res.json(loan);
});

v1Router.post(
  '/oracle/price-update',
  requireRole('admin'),
  auditMiddleware,
  timeoutMiddleware(parseInt(config.TIMEOUT_WRITE_MS, 10)),
  (_req: Request, res: Response) => {
    invalidateAll();
    res.json({ invalidated: true });
  }
);

v1Router.post(
  '/webhooks',
  auditMiddleware,
  timeoutMiddleware(parseInt(config.TIMEOUT_WRITE_MS, 10)),
  (req: Request, res: Response) => {
    const { url, encrypt } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }
    try {
      return res.status(201).json(registerWebhook(url, encrypt === true));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to register webhook';
      return res.status(400).json({ error: message });
    }
  }
);

v1Router.get(
  '/admin/webhooks',
  requireRole('admin'),
  readLimiter,
  (_req: Request, res: Response) => {
    res.json(getWebhooks());
  }
);

v1Router.get(
  '/admin/webhooks/logs',
  requireRole('admin'),
  readLimiter,
  (_req: Request, res: Response) => {
    res.json(getDeliveryLogs());
  }
);

// POST /admin/webhooks/dead-letter/replay — replay dead-lettered webhook deliveries
v1Router.post(
  '/admin/webhooks/dead-letter/replay',
  requireRole('admin'),
  auditMiddleware,
  timeoutMiddleware(parseInt(config.TIMEOUT_WRITE_MS, 10)),
  asyncHandler(async (_req: Request, res: Response) => {
    const replayed = await replayDeadLetterWebhooks();
    res.json({ replayed });
  })
);

v1Router.delete('/webhooks/:id', auditMiddleware, (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = deleteWebhook(id as string);
  if (!deleted) {
    return res
      .status(404)
      .json({ error: 'Webhook not found', message: `No webhook with id '${id}'` });
  }
  res.status(204).send();
});

v1Router.post('/alerts/webhook', auditMiddleware, async (req: Request, res: Response) => {
  const body = req.body;

  if (req.header('x-amz-sns-message-type') === 'SubscriptionConfirmation') {
    const subscribeUrl = body.SubscribeURL;
    if (subscribeUrl) {
      await fetch(subscribeUrl);
      return res.status(200).send('Subscribed');
    }
  }

  if (req.header('x-amz-sns-message-type') === 'Notification') {
    try {
      const message = JSON.parse(body.Message);
      if (
        message['detail-type'] === 'Backup Job State Change' &&
        message.detail.state === 'FAILED'
      ) {
        await fireAlert(rules.backupFailure, 'AWS Backup job failed', {
          backupJobId: message.detail.backupJobId,
          resourceArn: message.detail.resourceArn,
        });
      }
    } catch {
      // Not a JSON message or different format
    }
  }

  res.status(200).send('OK');
});

// ── Admin Routes ──────────────────────────────────────────────────────────────

// GET /admin/users — list all registered borrowers derived from loan records
v1Router.get(
  '/admin/users',
  requireRole('admin'),
  asyncHandler(async (_req: Request, res: Response) => {
    const { data } = listLoans({ page: 1, limit: 1000 });
    const users = [...new Set(data.map((l: any) => l.borrower))].map((borrower) => ({ borrower }));
    res.json({ data: users, total: users.length });
  })
);

// PATCH /admin/users/:wallet/role — assign a role to a user (admin only, audit-logged)
v1Router.patch(
  '/admin/users/:wallet/role',
  requireRole('admin'),
  auditMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const wallet = req.params.wallet as string;
    const { role } = req.body ?? {};

    if (!isValidRole(role)) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'INVALID_ROLE',
        message: "role must be one of 'borrower' or 'admin'",
      });
    }

    const updated = setUserRole(wallet, role);
    if (!updated) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    const actor = (req as any).user as { publicKey?: string } | undefined;
    insertAuditEntry({
      userId: actor?.publicKey ?? 'unknown',
      action: 'user.role.update',
      resource: 'user',
      resourceId: wallet,
      requestBody: redact({ role }),
      ip: req.ip,
    });

    auditLogger.info('user.role.update', {
      requestId: (req as any).requestId,
      userId: actor?.publicKey,
      targetWallet: wallet,
      role,
    });

    res.json({ wallet, role });
  })
);

// GET /admin/moderation-queue — loans flagged as pending review (status: pending)
v1Router.get(
  '/admin/moderation-queue',
  requireRole('admin'),
  asyncHandler(async (_req: Request, res: Response) => {
    const { data } = listLoans({ page: 1, limit: 1000 });
    const queue = (data as any[]).filter((l) => l.status === 'pending');
    res.json({ data: queue, total: queue.length });
  })
);

// GET /admin/statistics — aggregate platform stats
v1Router.get(
  '/admin/statistics',
  requireRole('admin'),
  asyncHandler(async (_req: Request, res: Response) => {
    const { data, total } = listLoans({ page: 1, limit: 1000 });
    const totalAmount = (data as any[]).reduce((sum, l) => sum + (l.amount || 0), 0);
    const byStatus = (data as any[]).reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    }, {});
    res.json({ totalLoans: total, totalAmount, byStatus });
  })
);

v1Router.get('/settings/:wallet', readLimiter, (req: Request, res: Response) => {
  const wallet = req.params.wallet as string;
  const existing = settingsStore.get(wallet);
  if (!existing) {
    return res.json({
      walletAddress: wallet,
      joinDate: new Date().toISOString(),
      notifications: { loanApproved: true, loanRepaid: true, liquidationWarning: true },
      language: 'en',
      currency: 'USD',
    });
  }
  res.json(existing);
});

v1Router.put('/settings/:wallet', auditMiddleware, (req: Request, res: Response) => {
  const wallet = req.params.wallet as string;
  const validation = settingsSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
  }
  const existing = settingsStore.get(wallet) ?? {
    walletAddress: wallet,
    joinDate: new Date().toISOString(),
    notifications: { loanApproved: true, loanRepaid: true, liquidationWarning: true },
    language: 'en',
    currency: 'USD',
  };
  const updated: UserSettings = { ...existing, ...validation.data };
  settingsStore.set(wallet, updated);
  res.json(updated);
});

// ── Notification preferences (issue #1528) ────────────────────────────────────

/**
 * GET /api/v1/settings/notifications
 *
 * Returns the caller's current notification preferences, including webhook URL
 * and per-event-type toggles.  Wallet address is passed as a query param.
 */
v1Router.get('/settings/notifications', readLimiter, (req: Request, res: Response) => {
  const wallet = (req.query.wallet as string | undefined) ?? 'anonymous';
  const existing = settingsStore.get(wallet);
  const prefs: NotificationPreferences = existing?.notificationPreferences ?? {
    webhookUrl: null,
    events: {
      loanApproved: true,
      loanRepaid: true,
      liquidationWarning: true,
      collateralUpdated: false,
      healthFactorAlert: true,
    },
  };
  res.json(prefs);
});

/**
 * PATCH /api/v1/settings/notifications
 *
 * Partial-update the caller's notification preferences.  Accepts a JSON body
 * with optional `webhookUrl` and `events` fields; merges into the existing
 * record rather than replacing it wholesale.  Wallet address is passed as a
 * query param so the route is usable before full auth is wired.
 *
 * Resolves issue #1528.
 */
v1Router.patch(
  '/settings/notifications',
  auditMiddleware,
  writeLimiter,
  (req: Request, res: Response) => {
    const wallet = (req.query.wallet as string | undefined) ?? 'anonymous';

    const validation = notificationPreferencesSchema.safeParse(req.body);
    if (!validation.success) {
      return res
        .status(400)
        .json({ error: 'Validation failed', details: validation.error.issues });
    }

    const existing = settingsStore.get(wallet) ?? {
      walletAddress: wallet,
      joinDate: new Date().toISOString(),
      notifications: { loanApproved: true, loanRepaid: true, liquidationWarning: true },
      language: 'en',
      currency: 'USD',
    };

    const patch = validation.data;
    const existingPrefs: NotificationPreferences = existing.notificationPreferences ?? {
      webhookUrl: null,
      events: {
        loanApproved: true,
        loanRepaid: true,
        liquidationWarning: true,
        collateralUpdated: false,
        healthFactorAlert: true,
      },
    };

    const updated: UserSettings = {
      ...existing,
      notificationPreferences: {
        webhookUrl:
          'webhookUrl' in patch ? (patch.webhookUrl ?? null) : existingPrefs.webhookUrl ?? null,
        events: {
          ...existingPrefs.events,
          ...patch.events,
        },
      },
    };

    settingsStore.set(wallet, updated);
    res.json(updated.notificationPreferences);
  }
);

/**
 * POST /api/v1/settings/notifications/test-webhook
 *
 * Sends a sample payload to the caller's registered webhook URL and returns
 * the outcome so the UI can show success / failure feedback.
 *
 * Resolves issue #1528 (test webhook button acceptance criterion).
 */
v1Router.post(
  '/settings/notifications/test-webhook',
  auditMiddleware,
  writeLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const wallet = (req.query.wallet as string | undefined) ?? 'anonymous';
    const existing = settingsStore.get(wallet);
    const webhookUrl = existing?.notificationPreferences?.webhookUrl;

    if (!webhookUrl) {
      return res.status(400).json({
        error: 'No webhook URL registered',
        message: 'Register a webhook URL via PATCH /api/v1/settings/notifications first.',
      });
    }

    const samplePayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      wallet,
      message: 'This is a test notification from StellarKraal.',
    };

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(samplePayload),
        signal: AbortSignal.timeout(5000),
      });
      res.json({
        success: response.ok,
        statusCode: response.status,
        message: response.ok
          ? "Test payload delivered successfully."
          : `Webhook returned HTTP ${response.status}.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({
        success: false,
        message: `Failed to deliver test payload: ${message}`,
      });
    }
  })
);

/**
 * GET /api/v1/transactions/:hash/status
 *
 * Polls the Soroban RPC for the status of a submitted transaction XDR hash.
 *
 * @returns `{ status: 'pending' | 'success' | 'failed', ledger?, errorCode? }`
 *
 * Rate-limited to 10 req/s per user (inherits readLimiter window of 1 min / 100 req).
 * A dedicated 6-second window limiter (max 10) is applied to match the 10 req/s spec.
 */
const txStatusLimiter = rateLimit({
  windowMs: 6 * 1000, // 6-second rolling window → 10 req/6s ≈ 10 req/s
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.setHeader('Retry-After', '6');
    res
      .status(429)
      .json({
        error: 'Too many requests',
        message: 'Transaction status polling is rate-limited to 10 req/s',
        retryAfter: 6,
      });
  },
  keyGenerator: (req: Request) => {
    const user = (req as any).user;
    return user?.publicKey ?? req.ip ?? 'anonymous';
  },
});

v1Router.get(
  '/transactions/:hash/status',
  txStatusLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { hash } = req.params as { hash: string };
    if (!hash || !/^[a-fA-F0-9]{64}$/.test(hash)) {
      return res
        .status(400)
        .json({ error: 'Validation failed', message: 'hash must be a 64-char hex string' });
    }

    let result: any;
    try {
      result = await rpcClient.getTransaction(hash);
    } catch (err: any) {
      return res
        .status(502)
        .json({
          error: 'RPC error',
          message: err?.message ?? 'Failed to query transaction status',
        });
    }

    // SorobanRpc.GetTransactionResponse status values: NOT_FOUND, SUCCESS, FAILED
    const rpcStatus: string = result?.status ?? 'NOT_FOUND';

    if (rpcStatus === 'SUCCESS') {
      return res.json({ status: 'success', ledger: result.ledger });
    }
    if (rpcStatus === 'FAILED') {
      return res.json({ status: 'failed', errorCode: result.resultXdr ?? undefined });
    }
    // NOT_FOUND → still pending (in mempool or not yet confirmed)
    return res.json({ status: 'pending' });
  })
);

// GET /api/v1/transactions/:id — get transaction details by local DB ID
v1Router.get(
  '/transactions/:id',
  readLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const tx = getTransaction(id);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(tx);
  })
);

// ── User Profile ──────────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/profile
 *
 * Update the authenticated user's profile.
 * Accepts partial updates for displayName and notificationPreferences.
 *
 * @param displayName - Optional user display name (2-40 characters)
 * @param notificationPreferences - Optional notification preferences object
 * @returns Updated profile object
 */
v1Router.patch(
  '/profile',
  auditMiddleware,
  validate(updateProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user as { publicKey?: string } | undefined;
    if (!user?.publicKey) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const updates = req.body;
    const profile = updateProfile(user.publicKey, updates);

    insertAuditEntry({
      userId: user.publicKey,
      action: 'profile.update',
      resource: 'profile',
      resourceId: user.publicKey,
      requestBody: redact(updates),
      ip: req.ip,
    });

    auditLogger.info('profile.update', {
      requestId: (req as any).requestId,
      userId: user.publicKey,
    });

    res.json(profile);
  })
);

export { v1Router, startTime, APP_VERSION };