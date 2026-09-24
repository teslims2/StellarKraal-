/**
 * GraphQL proof-of-concept tests (ADR-009 / issue #1076).
 *
 * Uses ApolloServer's built-in executeOperation() for isolated unit testing
 * of schema, resolvers, and validation without an HTTP server.
 *
 * The stellar SDK and contract services are mocked so this suite runs without
 * a live Soroban RPC connection (consistent with the rest of the unit tests).
 */

// ── Mocks (must be declared before module imports) ─────────────────────────

jest.mock('../services/loanService', () => ({
  loanRequestSchema: {
    safeParse: jest.fn((input: Record<string, unknown>) => {
      // Minimal validation: borrower must start with G and be 56 chars
      const b = input.borrower as string;
      if (!b || !/^G[A-Z2-7]{55}$/.test(b)) {
        return { success: false, error: { issues: [{ message: 'Invalid borrower' }] } };
      }
      return { success: true, data: input };
    }),
  },
  loanRepaySchema: {
    safeParse: jest.fn((input: Record<string, unknown>) => {
      const b = input.borrower as string;
      if (!b || !/^G[A-Z2-7]{55}$/.test(b)) {
        return { success: false, error: { issues: [{ message: 'Invalid borrower' }] } };
      }
      return { success: true, data: input };
    }),
  },
  requestLoan: jest.fn().mockResolvedValue({ xdr: 'mock-request-xdr' }),
  repayLoan: jest.fn().mockResolvedValue({ xdr: 'mock-repay-xdr' }),
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { ApolloServer } from '@apollo/server';
import { typeDefs } from './typeDefs';
import { resolvers } from './resolvers';
import * as store from '../db/store';

const VALID_BORROWER = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV2';

describe('GraphQL PoC', () => {
  let server: ApolloServer;

  beforeAll(async () => {
    server = new ApolloServer({ typeDefs, resolvers });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  // ── Query: loans ──────────────────────────────────────────────────────────

  describe('Query.loans', () => {
    it('returns a LoanPage with data and meta fields', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            loans {
              data { id borrower amount status }
              total
              page
              limit
            }
          }
        `,
      });

      expect(result.body.kind).toBe('single');
      const body = result.body as { kind: 'single'; singleResult: { data?: unknown; errors?: unknown[] } };
      expect(body.singleResult.errors).toBeUndefined();
      const data = body.singleResult.data as {
        loans: { data: unknown[]; total: number; page: number; limit: number };
      };
      expect(data.loans.data).toBeInstanceOf(Array);
      expect(data.loans.total).toBeGreaterThanOrEqual(0);
      expect(data.loans.page).toBe(1);
    });

    it('returns loans matching a status filter', async () => {
      store.insertLoan({
        id: 'gql-test-1',
        borrower: 'GABC',
        collateral_id: 'c1',
        amount: 500,
        status: 'active',
      });

      const result = await server.executeOperation({
        query: `
          query {
            loans(status: active) {
              data { id status }
              total
            }
          }
        `,
      });

      const body = result.body as {
        kind: 'single';
        singleResult: { data?: unknown; errors?: unknown[] };
      };
      expect(body.singleResult.errors).toBeUndefined();
      const data = body.singleResult.data as {
        loans: { data: { id: string; status: string }[]; total: number };
      };
      expect(data.loans.data.some((l) => l.id === 'gql-test-1')).toBe(true);
    });
  });

  // ── Query: collateral ──────────────────────────────────────────────────────

  describe('Query.collateral', () => {
    it('returns a CollateralPage', async () => {
      const result = await server.executeOperation({
        query: `
          query {
            collateral {
              data { id owner animal_type count appraised_value }
              total
              page
              limit
            }
          }
        `,
      });

      const body = result.body as {
        kind: 'single';
        singleResult: { data?: unknown; errors?: unknown[] };
      };
      expect(body.singleResult.errors).toBeUndefined();
      const data = body.singleResult.data as {
        collateral: { data: unknown[]; total: number };
      };
      expect(data.collateral.data).toBeInstanceOf(Array);
    });
  });

  // ── Query: loan by ID ──────────────────────────────────────────────────────

  describe('Query.loan', () => {
    it('returns null for a non-existent loan', async () => {
      const result = await server.executeOperation({
        query: `query { loan(id: "nonexistent") { id } }`,
      });

      const body = result.body as {
        kind: 'single';
        singleResult: { data?: unknown; errors?: unknown[] };
      };
      expect(body.singleResult.errors).toBeUndefined();
      const data = body.singleResult.data as { loan: null };
      expect(data.loan).toBeNull();
    });

    it('returns a loan by ID', async () => {
      store.insertLoan({
        id: 'gql-test-2',
        borrower: 'GDEF',
        collateral_id: 'c2',
        amount: 300,
        status: 'active',
      });

      const result = await server.executeOperation({
        query: `query { loan(id: "gql-test-2") { id borrower amount } }`,
      });

      const body = result.body as {
        kind: 'single';
        singleResult: { data?: unknown; errors?: unknown[] };
      };
      expect(body.singleResult.errors).toBeUndefined();
      const data = body.singleResult.data as {
        loan: { id: string; borrower: string; amount: number };
      };
      expect(data.loan?.id).toBe('gql-test-2');
      expect(data.loan?.borrower).toBe('GDEF');
    });
  });

  // ── Query: collateralById ─────────────────────────────────────────────────

  describe('Query.collateralById', () => {
    it('returns null for a non-existent collateral record', async () => {
      const result = await server.executeOperation({
        query: `query { collateralById(id: "missing-id") { id } }`,
      });

      const body = result.body as {
        kind: 'single';
        singleResult: { data?: unknown; errors?: unknown[] };
      };
      expect(body.singleResult.errors).toBeUndefined();
      const data = body.singleResult.data as { collateralById: null };
      expect(data.collateralById).toBeNull();
    });
  });

  // ── Mutation: requestLoan ─────────────────────────────────────────────────

  describe('Mutation.requestLoan', () => {
    it('returns BAD_USER_INPUT for an invalid borrower address', async () => {
      const result = await server.executeOperation({
        query: `
          mutation {
            requestLoan(
              borrower: "NOT_A_VALID_KEY"
              collateral_ids: [1]
              amount: 1000
            ) { xdr }
          }
        `,
      });

      const body = result.body as {
        kind: 'single';
        singleResult: {
          data?: unknown;
          errors?: { extensions?: { code?: string } }[];
        };
      };
      expect(body.singleResult.errors).toBeDefined();
      expect(body.singleResult.errors![0].extensions?.code).toBe('BAD_USER_INPUT');
    });

    it('returns xdr for a valid request', async () => {
      const result = await server.executeOperation({
        query: `
          mutation {
            requestLoan(
              borrower: "${VALID_BORROWER}"
              collateral_ids: [1]
              amount: 1000
            ) { xdr }
          }
        `,
      });

      const body = result.body as {
        kind: 'single';
        singleResult: { data?: unknown; errors?: unknown[] };
      };
      expect(body.singleResult.errors).toBeUndefined();
      const data = body.singleResult.data as { requestLoan: { xdr: string } };
      expect(typeof data.requestLoan.xdr).toBe('string');
    });
  });

  // ── Mutation: repayLoan ───────────────────────────────────────────────────

  describe('Mutation.repayLoan', () => {
    it('returns BAD_USER_INPUT for an invalid borrower address', async () => {
      const result = await server.executeOperation({
        query: `
          mutation {
            repayLoan(
              borrower: "NOT_A_VALID_KEY"
              loan_id: 1
              amount: 100
            ) { xdr }
          }
        `,
      });

      const body = result.body as {
        kind: 'single';
        singleResult: {
          data?: unknown;
          errors?: { extensions?: { code?: string } }[];
        };
      };
      expect(body.singleResult.errors).toBeDefined();
      expect(body.singleResult.errors![0].extensions?.code).toBe('BAD_USER_INPUT');
    });

    it('returns xdr for a valid repayment', async () => {
      const result = await server.executeOperation({
        query: `
          mutation {
            repayLoan(
              borrower: "${VALID_BORROWER}"
              loan_id: 1
              amount: 100
            ) { xdr }
          }
        `,
      });

      const body = result.body as {
        kind: 'single';
        singleResult: { data?: unknown; errors?: unknown[] };
      };
      expect(body.singleResult.errors).toBeUndefined();
      const data = body.singleResult.data as { repayLoan: { xdr: string } };
      expect(typeof data.repayLoan.xdr).toBe('string');
    });
  });
});
