/**
 * GraphQL type definitions for StellarKraal API v2 (proof-of-concept).
 *
 * Implements Query { loans, collateral } and Mutation { requestLoan, repayLoan }
 * backed by the existing service and store layer (ADR-009).
 *
 * Full SDL is declared here rather than in a .graphql file so that the schema
 * is bundled with the TypeScript output without extra build steps.
 */
export const typeDefs = `#graphql
  # ── Scalars ────────────────────────────────────────────────────────────────

  """ISO-8601 date-time string."""
  scalar DateTime

  # ── Enums ──────────────────────────────────────────────────────────────────

  """Current lifecycle status of a loan."""
  enum LoanStatus {
    active
    at_risk
    repaid
    liquidated
  }

  """Current lifecycle status of a collateral record."""
  enum CollateralStatus {
    available
    pledged
    liquidated
  }

  # ── Object types ───────────────────────────────────────────────────────────

  """A livestock collateral record registered on-chain."""
  type Collateral {
    id: ID!
    owner: String!
    animal_type: String!
    count: Int!
    appraised_value: Float!
    status: CollateralStatus
    createdAt: DateTime!
  }

  """A loan record backed by one or more collateral items."""
  type Loan {
    id: ID!
    borrower: String!
    collateral_id: String!
    amount: Float!
    status: LoanStatus
    health_factor: Float
    createdAt: DateTime!
  }

  """Paginated list of loans."""
  type LoanPage {
    data: [Loan!]!
    total: Int!
    page: Int!
    limit: Int!
  }

  """Paginated list of collateral records."""
  type CollateralPage {
    data: [Collateral!]!
    total: Int!
    page: Int!
    limit: Int!
  }

  """Unsigned XDR transaction ready for client-side signing."""
  type XdrTransaction {
    xdr: String!
  }

  # ── Queries ────────────────────────────────────────────────────────────────

  type Query {
    """List loans with optional pagination and filters."""
    loans(
      page: Int
      limit: Int
      status: LoanStatus
      borrowerAddress: String
    ): LoanPage!

    """Fetch a single loan by its ID."""
    loan(id: ID!): Loan

    """List collateral records with optional pagination and owner filter."""
    collateral(
      page: Int
      limit: Int
      ownerId: String
    ): CollateralPage!

    """Fetch a single collateral record by its ID."""
    collateralById(id: ID!): Collateral
  }

  # ── Mutations ──────────────────────────────────────────────────────────────

  type Mutation {
    """
    Build a request_loan Soroban transaction.
    Returns the unsigned XDR for the client to sign and submit.
    """
    requestLoan(
      borrower: String!
      collateral_ids: [Int!]!
      amount: Int!
      min_disbursement: Int
    ): XdrTransaction!

    """
    Build a repay_loan Soroban transaction.
    Returns the unsigned XDR for the client to sign and submit.
    """
    repayLoan(
      borrower: String!
      loan_id: Int!
      amount: Int!
    ): XdrTransaction!
  }
`;
