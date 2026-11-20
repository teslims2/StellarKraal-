/**
 * GraphQL resolvers for StellarKraal API v2 (ADR-011).
 *
 * All resolvers delegate to the existing service and store layer so that
 * business logic is not duplicated between REST and GraphQL surfaces.
 *
 * Query  { loans, loan, collateral, collateralById, user, me }
 * Mutation { requestLoan, repayLoan }
 *
 * DataLoader instances are created per-request (inside GraphQLContext) to
 * batch and cache all foreign-key lookups, preventing N+1 queries (#1537).
 */
import { GraphQLScalarType, Kind } from 'graphql';
import {
  listLoans,
  listCollateral,
  getLoan,
  getCollateral,
  getProfile,
  type LoanRecord,
  type UserProfile,
} from '../db/store';
import {
  requestLoan,
  repayLoan,
  loanRequestSchema,
  loanRepaySchema,
} from '../services/loanService';
import { GraphQLError } from 'graphql';

// ---------------------------------------------------------------------------
// DataLoader factory
// ---------------------------------------------------------------------------
// DataLoader is an optional peer-dependency. When unavailable (e.g. in older
// test environments that haven't installed it), we fall back to plain single
// lookups so the resolver file remains importable everywhere.

let DataLoader: (new <K, V>(batchFn: (keys: readonly K[]) => Promise<(V | Error)[]>) => {
  load: (key: K) => Promise<V | null>;
  loadMany: (keys: readonly K[]) => Promise<(V | Error | null)[]>;
}) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DataLoader = require('dataloader');
} catch {
  // dataloader not installed — resolvers fall back to direct store calls
}

/**
 * Per-request DataLoader instances.  One object is created in the GraphQL
 * context factory and shared across all resolvers within a single request so
 * that batching works correctly.
 */
export interface RequestLoaders {
  /** Batch-load user profiles by wallet address. */
  userByAddress: ReturnType<typeof createUserLoader>;
  /** Batch-load all loans for a list of borrower addresses. */
  loansByBorrower: ReturnType<typeof createLoansByBorrowerLoader>;
}

function createUserLoader() {
  if (DataLoader) {
    return new DataLoader<string, UserProfile | null>(async (addresses) => {
      return addresses.map((addr) => getProfile(addr) ?? null);
    });
  }
  // Fallback: mimic DataLoader interface without actual batching
  return {
    load: async (addr: string) => getProfile(addr) ?? null,
    loadMany: async (addrs: readonly string[]) =>
      addrs.map((a) => getProfile(a) ?? null),
  };
}

function createLoansByBorrowerLoader() {
  if (DataLoader) {
    return new DataLoader<string, LoanRecord[]>(async (borrowers) => {
      // Fetch all active loans once and partition by borrower address.
      const result = listLoans({ limit: 10_000, page: 1 });
      const byBorrower = new Map<string, LoanRecord[]>();
      for (const loan of result.data) {
        const bucket = byBorrower.get(loan.borrower) ?? [];
        bucket.push(loan);
        byBorrower.set(loan.borrower, bucket);
      }
      return borrowers.map((b) => byBorrower.get(b) ?? []);
    });
  }
  return {
    load: async (borrower: string) =>
      listLoans({ borrowerAddress: borrower, limit: 100, page: 1 }).data,
    loadMany: async (borrowers: readonly string[]) =>
      borrowers.map((b) =>
        listLoans({ borrowerAddress: b, limit: 100, page: 1 }).data
      ),
  };
}

/** Create a fresh set of DataLoader instances for one request. */
export function createLoaders(): RequestLoaders {
  return {
    userByAddress: createUserLoader(),
    loansByBorrower: createLoansByBorrowerLoader(),
  };
}

/** Custom DateTime scalar — passes through ISO strings unchanged. */
const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO-8601 date-time string',
  serialize(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    throw new GraphQLError(`DateTime cannot represent non-string value: ${value}`);
  },
  parseValue(value: unknown) {
    if (typeof value === 'string') return value;
    throw new GraphQLError(`DateTime cannot parse non-string input: ${value}`);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) return ast.value;
    throw new GraphQLError('DateTime expects a string literal');
  },
});

export const resolvers = {
  DateTime: DateTimeScalar,

  Query: {
    /**
     * List loans with optional pagination and filters.
     *
     * Supports two pagination modes:
     * - Offset-based (legacy): supply `page` + `limit`.
     * - Cursor-based (relay-style): supply `cursor` + `limit`.
     *
     * Always returns a `LoanConnection` with relay-style edges and pageInfo
     * regardless of which mode is used.
     */
    loans(
      _parent: unknown,
      args: {
        page?: number;
        limit?: number;
        status?: string;
        borrowerAddress?: string;
        cursor?: string;
      }
    ) {
      const { limit = 20, status, borrowerAddress, cursor } = args;
      const safeLimit = Math.min(Math.max(limit, 1), 100);

      if (cursor) {
        // Cursor-based mode: decode the opaque cursor (base64 ISO date string)
        // and return items created after that timestamp.
        let afterDate: Date;
        try {
          afterDate = new Date(Buffer.from(cursor, 'base64').toString('utf8'));
          if (isNaN(afterDate.getTime())) throw new Error('invalid date');
        } catch {
          throw new GraphQLError('Invalid cursor', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        // Fetch one extra item to determine hasNextPage
        const pageResult = listLoans({ status, borrowerAddress, page: 1, limit: 10_000 });
        const allLoans = pageResult.data.filter(
          (l) => new Date(l.createdAt) < afterDate
        );
        const sliced = allLoans.slice(0, safeLimit);
        const hasNextPage = allLoans.length > safeLimit;

        const edges = sliced.map((loan) => ({
          cursor: Buffer.from(loan.createdAt).toString('base64'),
          node: loan,
        }));

        return {
          edges,
          pageInfo: {
            hasNextPage,
            endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
          },
          totalCount: pageResult.total,
        };
      }

      // Offset-based mode
      const { page = 1 } = args;
      const result = listLoans({ page, limit: safeLimit, status, borrowerAddress });

      const edges = result.data.map((loan) => ({
        cursor: Buffer.from(loan.createdAt).toString('base64'),
        node: loan,
      }));

      const hasNextPage = page * safeLimit < result.total;

      return {
        edges,
        pageInfo: {
          hasNextPage,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        },
        totalCount: result.total,
      };
    },

    /**
     * Fetch a single loan by ID.
     */
    loan(_parent: unknown, args: { id: string }) {
      const record = getLoan(args.id);
      if (!record) return null;
      return record;
    },

    /**
     * List collateral records with optional pagination and owner filter.
     */
    collateral(
      _parent: unknown,
      args: {
        page?: number;
        limit?: number;
        ownerId?: string;
      }
    ) {
      const { page = 1, limit = 20, ownerId } = args;
      return listCollateral({ page, limit, ownerId });
    },

    /**
     * Fetch a single collateral record by ID.
     */
    collateralById(_parent: unknown, args: { id: string }) {
      const record = getCollateral(args.id);
      if (!record) return null;
      return record;
    },

    /**
     * Fetch a user profile by Stellar wallet address.
     * Uses the per-request DataLoader to avoid N+1 when called from nested resolvers.
     */
    async user(
      _parent: unknown,
      args: { walletAddress: string },
      context: { loaders?: RequestLoaders }
    ) {
      if (context.loaders) {
        return context.loaders.userByAddress.load(args.walletAddress);
      }
      return getProfile(args.walletAddress) ?? null;
    },

    /**
     * Return the authenticated user's own profile.
     * Requires a valid JWT (userPublicKey is set by the auth middleware).
     * Returns null when called without authentication.
     */
    async me(
      _parent: unknown,
      _args: Record<string, never>,
      context: { userPublicKey?: string; loaders?: RequestLoaders }
    ) {
      if (!context.userPublicKey) return null;
      if (context.loaders) {
        return context.loaders.userByAddress.load(context.userPublicKey);
      }
      return getProfile(context.userPublicKey) ?? null;
    },
  },

  // ── Field-level resolvers ──────────────────────────────────────────────────

  /**
   * Loan.borrowerProfile — resolved via DataLoader so a list of loans does not
   * trigger one profile lookup per row.
   */
  Loan: {
    async borrowerProfile(
      parent: { borrower: string },
      _args: Record<string, never>,
      context: { loaders?: RequestLoaders }
    ) {
      if (context.loaders) {
        return context.loaders.userByAddress.load(parent.borrower);
      }
      return getProfile(parent.borrower) ?? null;
    },
  },

  /**
   * User.loans — resolved via DataLoader so fetching multiple users does not
   * trigger one list query per user.
   */
  User: {
    async loans(
      parent: { walletAddress: string },
      _args: Record<string, never>,
      context: { loaders?: RequestLoaders }
    ) {
      if (context.loaders) {
        return context.loaders.loansByBorrower.load(parent.walletAddress);
      }
      return listLoans({ borrowerAddress: parent.walletAddress, limit: 100, page: 1 }).data;
    },
  },

  Mutation: {
    /**
     * Build a request_loan Soroban transaction.
     * Validates input via the shared Zod schema used by the REST endpoint.
     */
    async requestLoan(
      _parent: unknown,
      args: {
        borrower: string;
        collateral_ids: number[];
        amount: number;
        min_disbursement?: number;
      }
    ) {
      const parsed = loanRequestSchema.safeParse(args);
      if (!parsed.success) {
        throw new GraphQLError('Validation failed', {
          extensions: {
            code: 'BAD_USER_INPUT',
            issues: parsed.error.issues,
          },
        });
      }
      return requestLoan(parsed.data);
    },

    /**
     * Build a repay_loan Soroban transaction.
     * Validates input via the shared Zod schema used by the REST endpoint.
     */
    async repayLoan(
      _parent: unknown,
      args: {
        borrower: string;
        loan_id: number;
        amount: number;
      }
    ) {
      const parsed = loanRepaySchema.safeParse(args);
      if (!parsed.success) {
        throw new GraphQLError('Validation failed', {
          extensions: {
            code: 'BAD_USER_INPUT',
            issues: parsed.error.issues,
          },
        });
      }
      return repayLoan(parsed.data);
    },
  },
};
