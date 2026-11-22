# GraphQL API v2 Reference

## Overview

API v2 adds a GraphQL query layer mounted at `/api/v2/graphql`. It is implemented with:

- **[GraphQL Yoga](https://the-guild.dev/graphql/yoga-server)** — lightweight GraphQL server running on Express.
- **[Pothos](https://pothos-graphql.dev/)** — code-first schema builder; the SDL is derived from TypeScript types, so the schema and resolver types stay in sync without a separate SDL file.
- **[DataLoader](https://github.com/graphql/dataloader)** — request-scoped batching for all relational field lookups, preventing N+1 queries.
- **[graphql-codegen](https://the-guild.dev/graphql/codegen)** — generates typed React hooks for the Next.js frontend from the schema.

The existing REST v1 endpoints at `/api/v1` remain available and are maintained in parallel. See [Migration from REST v1](#migration-from-rest-v1) for a mapping.

> **ADR:** [ADR-011 — GraphQL as the API v2 Query Layer](adr/ADR-011-graphql-api-v2.md)

---

## Authentication

Every request to `/api/v2/graphql` must include a JWT in the `Authorization` header. The token is obtained via the same wallet challenge-response flow used by REST v1 (see [ADR-002](adr/ADR-002-jwt-auth.md)).

**curl:**

```bash
curl -X POST https://api.stellarkraal.example/api/v2/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -d '{"query":"{ me { address } }"}'
```

**fetch (browser / Node):**

```ts
const response = await fetch('/api/v2/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    query: `{
      me {
        address
        loans {
          id
          status
          principal
        }
      }
    }`,
  }),
});

const { data, errors } = await response.json();
```

Requests without a valid token receive a `401` HTTP response with an error in the `errors` array (see [Error handling](#error-handling)).

---

## Explorer / Playground

When the backend is running locally, open **`http://localhost:3001/api/v2/graphql`** in a browser. GraphQL Yoga serves a GraphiQL interface where you can browse the schema, write queries, and inspect results.

**Setting the Authorization header in GraphiQL:**

1. Click **Headers** at the bottom of the editor panel.
2. Add the following JSON:
   ```json
   {
     "Authorization": "Bearer <your_jwt_token>"
   }
   ```
3. Run any query — the header is sent with every request from the editor.

The playground is disabled in production (`NODE_ENV=production`).

---

## Schema

Types are shown in SDL format for readability. The authoritative source is the Pothos schema in `backend/src/graphql/schema/`.

### Core types

```graphql
type Loan {
  id: ID!
  borrower: String!
  principal: Int!
  interestRate: Float!
  termDays: Int!
  status: LoanStatus!
  healthFactor: Float          # null until the loan is funded
  originationFee: Int!
  collateral: Collateral
  repayments: [Repayment!]!
  createdAt: String!
  updatedAt: String!
}

enum LoanStatus {
  PENDING
  ACTIVE
  AT_RISK
  REPAID
  LIQUIDATED
  CANCELLED
  EXPIRED
}

type Collateral {
  id: ID!
  owner: String!
  animalType: String!
  count: Int!
  appraisedValue: Int!
  photoUrl: String
  location: String
  appraisalHistory: [AppraisalEntry!]!
  loans: [Loan!]!
  createdAt: String!
}

type AppraisalEntry {
  date: String!
  value: Int!
}

type Repayment {
  id: ID!
  loanId: ID!
  amount: Int!
  repaidAt: String!
}

type User {
  address: String!
  loans: [Loan!]!
  collaterals: [Collateral!]!
}
```

### Queries

```graphql
type Query {
  """Fetch a single loan by ID."""
  loan(id: ID!): Loan

  """
  List loans with optional filters.
  Defaults: limit = 20, offset = 0.
  """
  loans(
    status: LoanStatus
    borrower: String
    limit: Int
    offset: Int
  ): [Loan!]!

  """Fetch a single collateral record by ID."""
  collateral(id: ID!): Collateral

  """
  List collateral records with optional filters.
  Defaults: limit = 20, offset = 0.
  """
  collaterals(
    owner: String
    limit: Int
    offset: Int
  ): [Collateral!]!

  """Return the authenticated user's profile. Requires a valid JWT."""
  me: User
}
```

### Mutations

```graphql
type Mutation {
  """Submit a new loan request."""
  requestLoan(input: RequestLoanInput!): Loan!

  """Cancel a loan that is in PENDING status."""
  cancelLoan(id: ID!): Loan!

  """Register a new collateral record."""
  registerCollateral(input: RegisterCollateralInput!): Collateral!
}
```

### Input types

```graphql
input RequestLoanInput {
  """Collateral ID to back this loan."""
  collateralId: ID!

  """Requested principal amount in stroops."""
  principal: Int!

  """Annual interest rate as a decimal (e.g. 0.12 for 12%)."""
  interestRate: Float!

  """Loan term in days."""
  termDays: Int!
}

input RegisterCollateralInput {
  """Type of livestock (e.g. "cattle", "goat")."""
  animalType: String!

  """Number of animals being registered."""
  count: Int!

  """Appraised value in stroops at registration time."""
  appraisedValue: Int!

  """Optional URL for a photo of the collateral."""
  photoUrl: String

  """Optional GPS location string."""
  location: String
}
```

> **Monetary values** (`principal`, `originationFee`, `amount`, `appraisedValue`) are represented as `Int` in stroops (1 XLM = 10,000,000 stroops). Timestamps (`createdAt`, `updatedAt`, `repaidAt`, `date`) are ISO 8601 strings.

---

## Example queries

All examples are ready to paste into GraphiQL or any GraphQL client. Replace placeholder IDs and tokens with real values.

### Fetch a single loan with collateral and repayments

```graphql
query GetLoanDetail($id: ID!) {
  loan(id: $id) {
    id
    borrower
    principal
    interestRate
    termDays
    status
    healthFactor
    originationFee
    createdAt
    updatedAt
    collateral {
      id
      animalType
      count
      appraisedValue
      location
      appraisalHistory {
        date
        value
      }
    }
    repayments {
      id
      amount
      repaidAt
    }
  }
}
```

Variables:

```json
{ "id": "loan_abc123" }
```

### List active loans for the authenticated user

```graphql
query MyActiveLoans {
  me {
    address
    loans {
      id
      principal
      interestRate
      termDays
      status
      healthFactor
      createdAt
    }
  }
}
```

To filter by status across all borrowers (admin use):

```graphql
query ActiveLoans($limit: Int, $offset: Int) {
  loans(status: ACTIVE, limit: $limit, offset: $offset) {
    id
    borrower
    principal
    status
    healthFactor
  }
}
```

Variables:

```json
{ "limit": 20, "offset": 0 }
```

### Fetch collateral detail with appraisal history

```graphql
query GetCollateral($id: ID!) {
  collateral(id: $id) {
    id
    owner
    animalType
    count
    appraisedValue
    photoUrl
    location
    createdAt
    appraisalHistory {
      date
      value
    }
    loans {
      id
      status
      principal
    }
  }
}
```

Variables:

```json
{ "id": "col_xyz789" }
```

### Request a new loan (mutation)

```graphql
mutation RequestLoan($input: RequestLoanInput!) {
  requestLoan(input: $input) {
    id
    status
    principal
    interestRate
    termDays
    originationFee
    createdAt
  }
}
```

Variables:

```json
{
  "input": {
    "collateralId": "col_xyz789",
    "principal": 5000000000,
    "interestRate": 0.12,
    "termDays": 90
  }
}
```

### Register collateral (mutation)

```graphql
mutation RegisterCollateral($input: RegisterCollateralInput!) {
  registerCollateral(input: $input) {
    id
    owner
    animalType
    count
    appraisedValue
    location
    createdAt
  }
}
```

Variables:

```json
{
  "input": {
    "animalType": "cattle",
    "count": 5,
    "appraisedValue": 12000000000,
    "photoUrl": "https://cdn.stellarkraal.example/photos/col_xyz789.jpg",
    "location": "-1.286389,36.817223"
  }
}
```

---

## Error handling

GraphQL always returns HTTP `200` for well-formed requests. Errors appear in the `errors` array alongside any partial `data`.

**Example error response:**

```json
{
  "data": null,
  "errors": [
    {
      "message": "Loan not found",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["loan"],
      "extensions": {
        "code": "NOT_FOUND",
        "loanId": "loan_does_not_exist"
      }
    }
  ]
}
```

**Authentication failure** (missing or invalid JWT):

The server returns HTTP `401` and the `errors` array contains a single entry:

```json
{
  "data": null,
  "errors": [
    {
      "message": "Unauthorized: missing or invalid token",
      "extensions": {
        "code": "UNAUTHENTICATED"
      }
    }
  ]
}
```

**Common error codes (`extensions.code`)**

| Code | Meaning |
|------|---------|
| `UNAUTHENTICATED` | JWT is missing, expired, or invalid |
| `FORBIDDEN` | Token is valid but the caller lacks permission for this action |
| `NOT_FOUND` | The requested entity does not exist |
| `BAD_USER_INPUT` | Input validation failed (see `extensions.field` for details) |
| `INVALID_STATE` | The requested transition is not valid for the loan's current status |
| `INTERNAL_SERVER_ERROR` | Unexpected server error; check backend logs |

For the full list of application error codes, see [API Error Code Reference](api-error-codes.md).

---

## Pagination

All list queries (`loans`, `collaterals`) support cursor-free offset pagination:

| Argument | Type | Default | Maximum |
|----------|------|---------|---------|
| `limit` | `Int` | `20` | `100` |
| `offset` | `Int` | `0` | — |

**Example — fetch page 3 with 50 results per page:**

```graphql
query {
  loans(status: ACTIVE, limit: 50, offset: 100) {
    id
    borrower
    status
    principal
  }
}
```

There is no total count field in the current schema. If you need to detect the last page, request one more item than your page size and check whether the extra item was returned.

---

## N+1 prevention

DataLoader is used for every resolver that looks up a related entity by foreign key — `Loan.collateral`, `Loan.repayments`, `Collateral.loans`, and `Collateral.appraisalHistory`. Fetching a list of 50 loans and their collateral results in two database queries (one for loans, one batched collateral lookup), not 51.

This is handled entirely server-side. Consumers do not need to structure queries differently or use any special directives to trigger batching.

---

## Migration from REST v1

The table below maps common REST v1 endpoints to their GraphQL equivalents. Both APIs are live during the transition period.

| REST v1 | GraphQL v2 |
|---------|-----------|
| `GET /api/v1/loans/:id` | `query { loan(id: "...") { id status principal ... } }` |
| `GET /api/v1/loans?status=active` | `query { loans(status: ACTIVE) { id status ... } }` |
| `GET /api/v1/loans?borrower=G...` | `query { loans(borrower: "G...") { id status ... } }` |
| `GET /api/v1/loans/:id/collateral` | `query { loan(id: "...") { collateral { id animalType ... } } }` |
| `GET /api/v1/loans/:id/repayments` | `query { loan(id: "...") { repayments { id amount repaidAt } } }` |
| `GET /api/v1/collaterals/:id` | `query { collateral(id: "...") { id owner animalType ... } }` |
| `GET /api/v1/collaterals?owner=G...` | `query { collaterals(owner: "G...") { id animalType ... } }` |
| `GET /api/v1/users/me` | `query { me { address loans { id } collaterals { id } } }` |
| `POST /api/v1/loans` | `mutation { requestLoan(input: { ... }) { id status } }` |
| `DELETE /api/v1/loans/:id` (cancel) | `mutation { cancelLoan(id: "...") { id status } }` |
| `POST /api/v1/collaterals` | `mutation { registerCollateral(input: { ... }) { id } }` |

The primary advantage of the GraphQL equivalents is that all related data for a view (loan + collateral + repayments) can be fetched in a **single round-trip** instead of three sequential REST calls.

---

## Linking this document from the README

Add the following line to the **Documentation** table in the main `README.md`:

```markdown
| [GraphQL API v2 Reference](docs/graphql-api-v2.md) | GraphQL schema, query examples, authentication, pagination, and REST v1 migration guide |
```
