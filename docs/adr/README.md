# Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for StellarKraal. Each ADR documents a significant technical decision: the context that motivated it, what was decided, the alternatives that were considered, and the consequences.

For guidance on what warrants an ADR, how to write one, and the blank template to copy, see [`template.md`](template.md).

---

## ADR Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](ADR-001-soroban.md) | Use Soroban for On-Chain Loan Lifecycle Management | Accepted |
| [ADR-002](ADR-002-jwt-auth.md) | JWT-Based Authentication Strategy | Accepted |
| [ADR-003](ADR-003-sqlite.md) | SQLite as the Off-Chain Database | Accepted |
| [ADR-004](ADR-004-nextjs-tailwind.md) | Next.js 14 + Tailwind CSS for the Frontend | Accepted |
| [ADR-005](ADR-005-collateral-appraisal-model.md) | Use Off-Chain Appraisal Values for Collateral Valuation | Accepted |
| [ADR-006](ADR-006-oracle-design.md) | Multi-Oracle Median Aggregation for Livestock Price Feeds | Accepted |
| [ADR-007](ADR-007-oracle-twap.md) | Time-Weighted Average Price (TWAP) for Liquidation Price Feeds | Accepted |
| [ADR-008](ADR-008-sqlite-connection-pool.md) | Connection Pooling for Off-Chain and RPC Access | Accepted |
| [ADR-008](ADR-008-webhooks.md) | Webhook-Based Event Delivery for Loan Lifecycle Notifications | Accepted |
| [ADR-009](ADR-009-api-v2-design.md) | API v2 Design Direction | Superseded by [ADR-011](ADR-011-graphql-api-v2.md) |
| [ADR-010](ADR-010-event-driven-architecture.md) | Event-Driven Webhook Architecture | Accepted |
| [ADR-011](ADR-011-graphql-api-v2.md) | GraphQL as the API v2 Query Layer | Accepted |
| [ADR-012](ADR-012-off-chain-event-storage.md) | Off-Chain Event Storage Strategy | Proposed |

---

## Process Guide

### Proposing an ADR

1. Copy the blank template from [`template.md`](template.md) into a new file named `docs/adr/ADR-NNN-short-title.md`, incrementing `NNN` from the last entry in the index above.
2. Fill in all sections: Context, Decision, Alternatives Considered, and Consequences.
3. Set the status to **Proposed**.
4. Add a row to the index table in this file.
5. Open a pull request. Reference the ADR number in the PR title and description.

### Review

- ADRs that affect the Soroban contract require at least one reviewer with contract expertise.
- ADRs that affect the backend or frontend require one domain reviewer each.
- Allow at least 48 hours for asynchronous review. Decisions with broad impact should remain open for one week.
- Address reviewer feedback with new commits; do not rewrite history on a PR that is under review.

### Acceptance

- When the PR is approved and merged, change the status from **Proposed** to **Accepted** in the same merge commit.
- No further edits to an accepted ADR are permitted except to mark it **Deprecated** or **Superseded** (see below).

---

## ADR Statuses

| Status | Meaning |
|--------|---------|
| **Proposed** | A pull request is open; the decision has not yet been merged or formally agreed. |
| **Accepted** | The PR was merged and the decision is in force. |
| **Deprecated** | The decision was reversed or became irrelevant, but no replacement ADR was written. |
| **Superseded by ADR-NNN** | A newer ADR replaces this one. The superseding ADR is authoritative; this record is kept for historical context. |

ADRs are **immutable once accepted**. The record of what was decided, why, and when must remain intact so future contributors can understand the reasoning — including decisions that were later reversed.

---

## Superseding vs. Amending an ADR

**Supersede** when the decision itself changes — a different technology is chosen, a core design assumption is invalidated, or the team reverses course in a way that would make the existing ADR misleading if read as current policy.

Steps:
1. Change the old ADR's status to `Superseded by ADR-NNN` and add a link to the new ADR.
2. Write a new ADR with its own number. In its Context section, explain why the previous decision no longer holds and reference the superseded ADR by number.

**Amend** (via PR commentary or a linked follow-up note) only for factual corrections — a broken link, a misspelled name, an incorrect date — where the substance of the decision is unchanged. These edits should be minimal and noted in the PR description.

Do not silently update an accepted ADR's Decision, Alternatives, or Consequences sections. If the substance has changed, that change warrants a new ADR.

---

## Case Study: ADR-009 Superseded by ADR-011

[ADR-009](ADR-009-api-v2-design.md) was written in July 2026. It evaluated REST, GraphQL, and tRPC for the API v2 layer and proposed continuing with **REST enhanced by OpenAPI 3.1**. The decision was filed with status **Proposed** and was never formally merged as **Accepted**.

Subsequent development exposed concrete problems that the REST proposal did not solve:

- The loan detail view required **3–5 sequential REST calls** (loan → collateral → appraisals → repayment history → health factor), causing waterfall latency that grew with each new data requirement.
- **Over-fetching** was endemic: endpoints returned full resource shapes when the frontend needed only a subset of fields, and adding `?fields=` parameters to every endpoint was impractical at scale.
- **Consumer/server contract drift**: the fields the frontend actually needed diverged from what the REST endpoints returned, requiring manual coordination across teams on every API change.
- **tRPC** was reconsidered but ruled out because the frontend and backend are separate deployments with no shared module resolution path, which eliminates tRPC's primary advantage.

These pain points directly matched the scenarios ADR-009 had flagged as future triggers for reconsideration. [ADR-011](ADR-011-graphql-api-v2.md), written in September 2026, superseded ADR-009 and accepted **GraphQL** as the v2 query layer, implemented with:

- **[GraphQL Yoga](https://the-guild.dev/graphql/yoga-server)** as the server.
- **[Pothos](https://pothos-graphql.dev/)** for a TypeScript-native, code-first schema — no separate SDL file to maintain.
- **[DataLoader](https://github.com/graphql/dataloader)** for request-scoped batching, eliminating the N+1 query problem.
- **[graphql-codegen](https://the-guild.dev/graphql/codegen)** to generate typed React hooks for the frontend, replacing the `openapi-typescript` codegen pipeline.

ADR-009 was marked `Superseded by ADR-011` and kept in this directory. ADR-011 is now the authoritative record for the API v2 query layer decision.
