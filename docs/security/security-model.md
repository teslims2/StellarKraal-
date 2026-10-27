<!-- Authorized Protocol Quality Assurance & Formal Verification Documentation -->

# StellarKraal Security Model & Trust Architecture

**Status:** Approved Reference Architecture  
**Document Location:** `docs/security/security-model.md`  
**Related Issue:** #331  
**Last Reviewed:** October 2026  
**Audience:** Protocol Engineers, Security Auditors, External Contributors  

---

## 1. Executive Summary & Architecture Overview

StellarKraal is a decentralized lending and collateral management protocol deployed on the Stellar network leveraging Soroban smart contracts, paired with an off-chain appraisal service, a Node.js/Fastify backend API, and a Next.js web application.

The objective of this security model is to define formal trust boundaries, authentication lifecycles, role-based authorization hierarchies, data validation invariants, and threat assumptions across all components of the system.

```
+-------------------------------------------------------------+
|                      Untrusted Public                       |
+-------------------------------------------------------------+
                              |
                     [Browser / Wallet]
                              |
+===================== TRUST BOUNDARY 1 =====================+
| Frontend Client (Next.js App)                               |
| - Client-side state & wallet signing (Freighter / Albedo)   |
+===================== TRUST BOUNDARY 2 =====================+
               |                                      |
         HTTPS / Bearer                         Soroban RPC
               v                                      v
+-------------------------------+    +------------------------+
| Backend Service (Node/Fastify)|    | Soroban Smart Contract |
| - Auth & Token Lifecycle      |    | - Invariant Enforcement|
| - Appraisal Cache & Oracle    |    | - Collateral Escrow    |
| - Webhook Dispatcher          |    | - Loan Lifecycle       |
+-------------------------------+    +------------------------+
               |                                      ^
+==============|====== TRUST BOUNDARY 3 ==============|=======+
| Database & Off-chain Oracle                         |
| - SQLite / PostgreSQL (Persistence)                 |
| - Oracle Feed Signing Key (Secured Storage) --------+
+=============================================================+
```

---

## 2. Trust Boundaries & Isolation

### 2.1 Trust Boundary 1: User Client to Application Tier
- **Context:** Web browser running the Next.js frontend, mobile browsers, or direct API callers.
- **Trust Assumption:** Zero trust. All inputs from user agents are considered untrusted, potentially hostile, and subject to client-side manipulation.
- **Isolation Mechanism:** All requests must terminate at TLS 1.3 endpoints. Client-side state is non-authoritative; no critical authorization decisions are made on the client.

### 2.2 Trust Boundary 2: Frontend to Backend API
- **Context:** REST and WebSocket communication between user sessions and the backend service (`backend/src/`).
- **Trust Assumption:** Semi-trusted once authenticated via cryptographic signatures.
- **Isolation Mechanism:**
  - Mandatory token verification (`Bearer` JWT) on all non-public endpoints.
  - Per-IP and per-account rate limiting with Redis-backed token bucket.
  - Strict CORS origin validation ensuring requests originate only from verified domain origins.
  - JSON Schema and Zod payload validation rejecting extraneous or malformed fields.

### 2.3 Trust Boundary 3: Off-Chain Infrastructure to Soroban Smart Contracts
- **Context:** Interactions between the backend/oracle reporter and on-chain Soroban contracts (`contracts/stellarkraal/`).
- **Trust Assumption:** The smart contract trusts only its cryptographic state and transactions signed by authorized keys (e.g., contract admin, oracle updater, loan participants).
- **Isolation Mechanism:**
  - On-chain `require_auth()` checks on all state-mutating transactions.
  - Oracle updates require valid signatures matching the stored `admin` or designated `oracle_address`.
  - Reentrancy resistance guaranteed by Soroban execution model and state checks-effects-interactions flow.

---

## 3. Authentication Mechanism & Token Lifecycle

StellarKraal employs a non-custodial, cryptographic challenge-response authentication flow backed by Stellar wallet keypairs (Ed25519) and stateless JWT access tokens.

```
Client (Wallet)               Backend API                 Database
      |                            |                          |
      |--- 1. POST /auth/challenge >|                          |
      |<-- 2. Nonce + Timestamp ---|                          |
      |                            |                          |
      | [Sign Nonce with Ed25519]  |                          |
      |--- 3. POST /auth/verify -->|                          |
      |   (publicKey + signature)  |-- 4. Verify Ed25519 ---->|
      |                            |   & Issue Tokens         |
      |<-- 5. JWT Access Token ----|                          |
      |      + Refresh Token       |                          |
```

### 3.1 Authentication Handshake
1. **Challenge Request:** Client requests an ephemeral challenge nonce via `POST /api/v1/auth/challenge`.
2. **Nonce Generation:** Backend generates a cryptographically secure random nonce (`crypto.randomBytes(32)`), stores it with an expiration TTL (5 minutes), and returns it to the client.
3. **Wallet Signature:** User signs the challenge message with their Stellar wallet (e.g., Freighter) using their private key.
4. **Signature Verification:** Backend verifies the signature against the claimed public key using `stellar-sdk.Keypair.verify()`.
5. **Token Issuance:** Upon successful verification, the backend issues an access token and a refresh token.

### 3.2 Token Lifecycle & Parameters

| Token Type | Algorithm | Lifetime / TTL | Storage | Scope / Purpose |
|------------|-----------|----------------|---------|-----------------|
| **Access Token** | RS256 / HS256 | 15 minutes | In-Memory (Client) | Bearer auth for API routes; short-lived to limit exposure |
| **Refresh Token** | Cryptographic opaque string | 7 days | Secure HTTP-only Cookie / DB | Exchanging for new access tokens; subject to rotation |
| **API Key (M2M)** | SHA-256 hashed | Configurable | Encrypted Key Store | Service-to-service automation and telemetry reporting |

### 3.3 Revocation & Session Invalidation
- **Token Rotation:** Every refresh token exchange invalidates the previously issued refresh token and returns a new token pair.
- **Replay Protection:** If an expired or already-used refresh token is presented, the entire session family for that public key is immediately revoked.
- **Explicit Logout:** `POST /api/v1/auth/logout` revokes active refresh tokens and clears client session cookies.

---

## 4. Authorization Model & Role Permissions (RBAC)

StellarKraal defines a structured Role-Based Access Control (RBAC) model across off-chain and on-chain operations.

### 4.1 Role Hierarchy

| Role | Scope | Description |
|------|-------|-------------|
| **Public / Guest** | Off-Chain | Unauthenticated users; read-only access to market statistics and contract addresses |
| **Borrower** | Dual (API + Contract) | Authenticated wallet with active collateral pledges; can request loans and repay debt |
| **Lender / LP** | Dual (API + Contract) | Authenticated wallet providing capital to lending pools; receives yield |
| **Oracle Reporter** | Contract-Restricted | Dedicated keypair authorized to post valuation appraisals and external price feeds |
| **Protocol Admin** | Dual (API + Contract) | Multi-sig / Governance address authorized for parameter tuning and emergency pauses |

### 4.2 Permission Matrix

| Operation | Public | Borrower | Lender | Oracle Reporter | Admin |
|-----------|:------:|:--------:|:------:|:---------------:|:-----:|
| View Market Stats & Health | Yes | Yes | Yes | Yes | Yes |
| Request Auth Challenge | Yes | Yes | Yes | Yes | Yes |
| Deposit Collateral (Soroban) | No | **Self** | **Self** | No | No |
| Drawdown Loan (Soroban) | No | **Self** | No | No | No |
| Repay Loan Debt (Soroban) | No | **Self** | No | No | No |
| Post Appraisal Data | No | No | No | **Yes** | **Yes** |
| Configure Risk Parameters (LTV, Rates) | No | No | No | No | **Yes** |
| Trigger Emergency Pause | No | No | No | No | **Yes** |
| Rotate Webhook Secrets | No | No | No | No | **Yes** |

---

## 5. Data Validation & Input Sanitization

To prevent adverse state manipulation and invariant divergence, validation is enforced at every layer:

### 5.1 Presentation Tier (Frontend)
- Client-side schema validation via TypeScript types and form helpers.
- String escaping to neutralize Cross-Site Scripting (XSS) in rendering pipelines.
- Format assertions for Stellar public keys (`G[A-Z0-9]{55}`) prior to dispatch.

### 5.2 Application Tier (Backend Fastify API)
- Strict request validation using JSON Schema and TypeBox/Zod interceptors.
- Stripping of non-whitelisted payload properties (`additionalProperties: false`).
- Numeric range bounding on all loan amounts, interest rates, and durations.
- Safe serialization preventing prototype pollution and injection flaws.

### 5.3 On-Chain Tier (Soroban Smart Contracts)
- **Math Safety:** Explicit checked arithmetic (`checked_add`, `checked_sub`, `checked_mul`, `checked_div`) preventing integer overflows or underflows.
- **Invariant Verification:**
  - Loan-to-Value (LTV) ratios strictly checked before state transitions.
  - Zero-balance and dust amount protections.
  - Non-reentrancy guards on balance modifications and external token invocations.
- **Authentication Enforcement:** Unconditional `address.require_auth()` verification ensuring callers cannot manipulate accounts other than their own.

---

## 6. Known Limitations & Out-of-Scope Threat Assumptions

### 6.1 Out-of-Scope Threats
1. **Client Endpoint Compromise:** If an end user's personal device, browser, or private key is compromised by external malware, the protocol cannot reverse signed Stellar transactions.
2. **Underlying Stellar Consensus:** The security model relies on the Stellar network's Byzantine Agreement protocol (SCP). Consensus-level chain halts or reorganization are outside application scope.
3. **Third-Party RPC Provider Faults:** Manipulation or latency from third-party Soroban RPC nodes is mitigated by multi-RPC fallbacks, but malicious RPC responses remain an external infrastructure dependency.

### 6.2 Known Operational Limitations
- **Oracle Latency:** Market fluctuations occurring faster than the oracle reporting interval may temporarily cause valuation desynchronization. Collateral buffer limits (haircuts) mitigate this risk.
- **In-Memory Cache Eviction:** Fastify in-memory appraisal caches must be synchronized across scaled replicas using shared state stores (e.g., Redis) to avoid transient price inconsistencies.

---

## 7. Security Reviews & Continuous Governance

- **Peer Review:** Changes to authentication logic, signature verification, or smart contract authorization must receive approval from at least two independent core maintainers.
- **Automated Regression Audits:** All pull requests are verified against CI test suites, static analysis (`cargo clippy`, `eslint`), and dependency vulnerability scanners (`cargo-audit`, `npm audit`).
- **Incident Response:** Security discrepancies must be reported privately according to [SECURITY.md](../../SECURITY.md) guidelines and triaged via the incident response runbook.
