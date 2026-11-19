# Troubleshooting Guide

Common errors encountered when developing or running StellarKraal, organised by category with cause and resolution for each.

---

## Setup

### 1. `npm ERR! code ERESOLVE` — dependency conflict on install

**Symptom:** `npm install` fails with `ERESOLVE unable to resolve dependency tree`.

**Cause:** Mismatched peer dependency versions, often triggered by running the wrong Node.js version.

**Resolution:**
1. Confirm you are on Node.js 20+: `node --version`
2. Delete cached state and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

---

### 2. `stellar: command not found`

**Symptom:** Running `stellar` or `stellar-cli` in the terminal returns `command not found`.

**Cause:** The Stellar CLI was installed via Cargo but `~/.cargo/bin` is not on `PATH`.

**Resolution:**
```bash
export PATH="$HOME/.cargo/bin:$PATH"
```
Add that line to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.) to make it permanent.

---

### 3. `error: failed to run custom build command for 'soroban-env-host'`

**Symptom:** `cargo build` or `cargo test` inside `contracts/stellarkraal` fails with the above error.

**Cause:** The `wasm32-unknown-unknown` Rust target is missing.

**Resolution:**
```bash
rustup target add wasm32-unknown-unknown
```

---

### 4. `Error: Cannot find module 'sqlite3'` / `sqlite3 module not found`

**Symptom:** The backend fails to start with a missing `sqlite3` module error.

**Cause:** The native `sqlite3` addon failed to compile during `npm install` due to missing build tools.

**Resolution:**
- **Linux:** `sudo apt install build-essential libsqlite3-dev`
- **macOS:** `xcode-select --install`
- Then rebuild the addon: `npm rebuild sqlite3` inside `backend/`

---

### 5. `cp: cannot stat 'env.example': No such file or directory`

**Symptom:** `cp env.example .env` fails after cloning.

**Cause:** The file is named `.env.example` in some branches and `env.example` in others.

**Resolution:** Check which file exists and copy the correct one:
```bash
ls .env.example env.example 2>/dev/null
cp .env.example .env   # or: cp env.example .env
```

---

## Runtime

### 6. `Error: listen EADDRINUSE :::3001` — PORT already in use

**Symptom:** The backend refuses to start with `EADDRINUSE`.

**Cause:** Another process is already bound to port 3001 (or whichever port `PORT` is set to).

**Resolution:**
```bash
# Find the process
lsof -i :3001
# Kill it
kill -9 <PID>
```
Or change `PORT` in `.env` to a free port.

---

### 7. `Cannot connect to RPC_URL` / `fetch failed` calling Soroban RPC

**Symptom:** API calls that invoke the smart contract return network errors or timeouts.

**Cause:** `RPC_URL` in `.env` is wrong, the testnet endpoint is temporarily down, or there is no internet access.

**Resolution:**
1. Verify the value: `grep RPC_URL .env`
2. Test reachability: `curl -s https://soroban-testnet.stellar.org` should return JSON.
3. If the public testnet is down, check [Stellar Status](https://status.stellar.org/) or switch to a local Stellar node.

---

### 8. `CORS policy` error in browser — frontend API requests blocked

**Symptom:** Browser console shows `Access to fetch at 'http://localhost:3001' from origin 'http://localhost:3000' has been blocked by CORS policy`.

**Cause:** `FRONTEND_URL` is not set or does not match the origin the frontend is served from.

**Resolution:** Add or correct the variable in `.env`:
```
FRONTEND_URL=http://localhost:3000
```
Restart the backend after saving.

---

### 9. `JsonWebTokenError: invalid signature` / `401 Unauthorized` on API requests

**Symptom:** Authenticated API endpoints return 401 with a JWT error in the backend logs.

**Cause:** `JWT_SECRET` differs between the process that issued the token and the process validating it (e.g., after rotating the secret without re-logging in).

**Resolution:**
1. Ensure `JWT_SECRET` is identical across all backend instances and matches the value used when the token was issued.
2. Clear browser storage / cookies and log in again to obtain a fresh token.

---

### 10. Frontend stuck on loading — `backend` health check failing in Docker

**Symptom:** `docker compose up` starts but the frontend never becomes available; `docker compose ps` shows `frontend` as `starting`.

**Cause:** The frontend waits for the backend to pass its health check (`GET /api/health`). If the backend is unhealthy, the frontend never starts.

**Resolution:**
```bash
docker compose logs backend
```
Fix the underlying backend error (often a missing env variable or failed migration), then:
```bash
docker compose restart backend
```

---

## Contract

### 11. `HostError: Error(Contract, #10)` — contract invocation rejected

**Symptom:** A contract call returns a `HostError` with a contract-defined error code.

**Cause:** The contract enforced a business rule (e.g., loan-to-value exceeded, collateral already locked, unauthorised caller).

**Resolution:**
1. Check the error code against the contract source in `contracts/stellarkraal/src/lib.rs`.
2. Verify the inputs (collateral ID, loan amount, caller address) satisfy the contract's preconditions.
3. Run `cargo test` locally to reproduce the scenario in a unit test.

---

### 12. `TransactionResultCode.txBAD_SEQ` — transaction sequence number mismatch

**Symptom:** Submitting a transaction via Freighter or the backend returns `txBAD_SEQ`.

**Cause:** The account's sequence number on-chain is ahead of what the client cached, usually because another transaction was submitted concurrently.

**Resolution:**
1. Refresh the account sequence number before building the transaction.
2. In the backend, ensure no two code paths submit transactions for the same account simultaneously.
3. Retry the operation — the client will fetch the latest sequence number on the next attempt.

---

### 13. `Contract not found` / `invoke_contract` returns `MissingValue`

**Symptom:** Any contract invocation fails with a "not found" or missing value error.

**Cause:** `CONTRACT_ID` in `.env` points to a contract that has not been deployed to the current network, or the wrong network is selected.

**Resolution:**
1. Confirm the network: `grep NEXT_PUBLIC_NETWORK .env`
2. Confirm the contract is deployed: `stellar contract info --id $CONTRACT_ID --network testnet`
3. If not deployed, follow `docs/deployment/contract-deployment.md` to deploy and update `CONTRACT_ID`.

---

## Database

### 14. `SQLITE_CANTOPEN: unable to open database file`

**Symptom:** The backend logs `SQLITE_CANTOPEN` on startup.

**Cause:** The SQLite file path configured in `database.json` does not exist or the process lacks write permission.

**Resolution:**
```bash
# Check the configured path
cat backend/database.json
# Ensure the directory is writable
ls -la backend/
# Create the file if missing (migrations will populate it)
touch backend/dev.sqlite3
npm run migrate:dev --prefix backend
```

---

### 15. `Migration failed: table already exists`

**Symptom:** Running `npm run migrate:dev` fails with a "table already exists" error.

**Cause:** A previous partial migration left the database in an inconsistent state, or migrations were run twice.

**Resolution:**
1. For a development database it is safe to reset:
   ```bash
   rm backend/dev.sqlite3
   npm run migrate:dev --prefix backend
   ```
2. For a shared or staging database, inspect the `migrations` table and manually mark the failed migration as rolled back before re-running.

---

## Contract Errors

This section is a centralised reference for Soroban contract invocation failures. Most
failures fall into one of three buckets: a contract-defined business rule was violated, the
host rejected the transaction envelope, or the client could not reach the RPC at all.

### 16. `HostError: Error(Contract, #N)` — contract-defined error codes

**Symptom:** The RPC returns a `HostError` whose `Contract` variant carries a numeric code
(e.g. `Error(Contract, #4)`).

**Cause:** The contract's `#[contracterror]` enum returned an error. Each code maps to a
specific business rule (insufficient collateral, loan already active, unauthorised caller,
invalid amount, etc.).

**Resolution:**
1. Look up the code in the `ContractError` enum in `contracts/stellarkraal/src/lib.rs`.
2. Confirm the caller address is authorised for the operation (e.g. the loan owner).
3. Confirm the numeric inputs are within the contract's allowed range.
4. Reproduce locally with a unit test before retrying on testnet:
   ```bash
   cargo test --manifest-path contracts/stellarkraal/Cargo.toml
   ```

### 17. `HostError: Error(WasmVm, InvalidAction)` — contract not initialised

**Symptom:** Invocation fails with a `WasmVm` error or `MissingValue` when reading storage.

**Cause:** The contract was deployed but `initialize` was never called, so required storage
keys (admin, token addresses, config) are absent.

**Resolution:**
1. Check whether the contract is initialised:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network testnet -- initialize --help
   ```
2. If uninitialised, run the deployment initialisation step from
   `docs/deployment/contract-deployment.md`.

### 18. `HostError: Error(Auth, InvalidAction)` — authorisation failure

**Symptom:** Invocation fails with an `Auth` error even though the transaction was signed.

**Cause:** The signed account does not match the address the contract expects to authorise
(e.g. the admin address, or the loan owner), or the required `require_auth` call was not
included in the invocation.

**Resolution:**
1. Confirm the signing account matches the address passed to the contract.
2. Ensure the client includes the required authorisation entries when building the
   transaction (the `freighterClient.ts` wrapper handles this for standard flows).
3. Re-sign and resubmit after correcting the caller.

### 19. `TransactionResultCode.txINSUFFICIENT_FEE` — fee too low

**Symptom:** Submission fails with `txINSUFFICIENT_FEE`.

**Cause:** The fee bid is below the current network minimum, often after a surge in
network activity.

**Resolution:**
1. Re-simulate the transaction to obtain an updated fee:
   ```bash
   stellar contract invoke --id $CONTRACT_ID --network testnet -- <fn> <args>
   ```
2. Increase the fee bid in the client and resubmit.

---

## RPC Connectivity

### 20. RPC request times out

**Symptom:** Contract calls hang and eventually fail with `ETIMEDOUT`, `fetch failed`, or a
`TimeoutError` after ~30 seconds.

**Cause:** The RPC endpoint is unreachable, slow, or the request payload is too large
(e.g. an unbounded ledger range query).

**Resolution:**
1. Verify the endpoint responds:
   ```bash
   curl -sS -m 10 -X POST "$RPC_URL" \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
   ```
   A healthy node returns `{"status":"healthy"}`.
2. If the public testnet is slow, switch `RPC_URL` to a local node or an alternate provider.
3. Reduce the scope of ledger queries (narrow the `startLedger` range) and retry.
4. Check [Stellar Status](https://status.stellar.org/) for ongoing incidents.

### 21. `ECONNREFUSED` / `ENOTFOUND` connecting to RPC

**Symptom:** Immediate connection failure rather than a timeout.

**Cause:** `RPC_URL` is malformed, points at a local node that is not running, or DNS
resolution failed.

**Resolution:**
1. Print the configured value: `grep RPC_URL .env`
2. Confirm the host resolves: `nslookup soroban-testnet.stellar.org`
3. If using a local node, confirm it is running: `docker compose ps stellar-node`
4. Restart the backend after correcting `RPC_URL`.

### 22. `429 Too Many Requests` from the RPC

**Symptom:** Intermittent `429` responses under load.

**Cause:** The public RPC enforces rate limits per IP.

**Resolution:**
1. Add backoff/retry around RPC calls in the client.
2. Cache read-only results (e.g. account balances) where possible.
3. For sustained load, point `RPC_URL` at a dedicated provider or a local node.

---

## Sequence Number Mismatch

### 23. `txBAD_SEQ` — resolving sequence number mismatches

**Symptom:** Submission fails with `TransactionResultCode.txBAD_SEQ`, or the RPC reports
`tx_bad_seq` in the result XDR.

**Cause:** Every Stellar account has a monotonically increasing sequence number. A
transaction is only valid if its sequence number is exactly `current + 1`. Mismatches occur
when:
- Two transactions are built from the same cached sequence number (concurrent submits).
- A previous transaction was submitted but the client did not observe the result.
- The client cached a stale sequence number across a long-running session.

**Resolution:**
1. Fetch the current on-chain sequence number:
   ```bash
   stellar account show --account $ACCOUNT_ID --network testnet
   ```
   The `sequence` field is the last *used* sequence number; the next transaction must use
   `sequence + 1`.
2. Rebuild the transaction with the refreshed sequence number and re-sign it.
3. Ensure only one code path submits transactions for a given account at a time (serialise
   submissions or use a per-account lock).
4. If a transaction was submitted but its result was lost, query it before retrying:
   ```bash
   stellar tx info --hash <TX_HASH> --network testnet
   ```
   If it succeeded, do not resubmit — advance the local sequence number instead.

---

## FAQ

The five most frequently reported issues, with quick answers.

### Q1. Why does my contract call fail with `Error(Contract, #N)`?

The contract rejected the call because a business rule was violated. Look up the code in the
`ContractError` enum in `contracts/stellarkraal/src/lib.rs` and verify your inputs and caller
address. See [Contract Errors](#contract-errors).

### Q2. Why do I get `txBAD_SEQ` when submitting a transaction?

Your transaction's sequence number does not match the account's on-chain sequence. Refresh
the sequence number, rebuild and re-sign the transaction, and avoid concurrent submissions
for the same account. See [Sequence Number Mismatch](#sequence-number-mismatch).

### Q3. Why does the RPC call time out or return `fetch failed`?

Either `RPC_URL` is wrong/unreachable or the endpoint is slow. Verify with a `getHealth`
curl, check [Stellar Status](https://status.stellar.org/), and consider a local node. See
[RPC Connectivity](#rpc-connectivity).

### Q4. Why is the frontend stuck on loading after `docker compose up`?

The frontend waits for the backend health check. Inspect `docker compose logs backend`, fix
the underlying error, then `docker compose restart backend`. See item 10 above.

---

## Docker Compose

### 24. Missing or incomplete `.env` file — services fail to start

**Symptom:** One or more containers exit immediately after `docker compose up`, with errors
like `Error: config validation failed` or `invalid input syntax for type integer`.

**Cause:** One or more required environment variables are missing from `.env`, or `.env`
was not copied from `.env.example` before starting.

**Resolution:**
1. Create `.env` if it does not exist:
   ```bash
   cp .env.example .env
   ```
2. Run the env pre-flight check to identify every missing variable:
   ```bash
   ./scripts/check-env.sh
   ```
3. Set the missing values in `.env`, then restart:
   ```bash
   docker compose up --build
   ```

---

### 25. Port already in use — container fails to bind

**Symptom:** A container exits with `Error starting userland proxy: listen tcp 0.0.0.0:<PORT>: bind: address already in use`, or `docker compose up` reports `Ports are not available`.

**Cause:** Another process on the host already holds the port that a service is trying to bind.

| Service | Default port |
|---------|-------------|
| `frontend` | 3000 |
| `backend` | 3001 |
| `postgres` | 5432 |
| `redis` | 6379 |
| `loki` | 3100 |
| `prometheus` | 9090 |
| `grafana` | 3200 |

**Resolution:**

Option A — stop the conflicting process:
```bash
# Find the process (Linux/macOS)
lsof -i :<PORT>
kill -9 <PID>
```

Option B — remap the host port in a `docker-compose.override.yml` (without editing the
base file):
```yaml
# docker-compose.override.yml
services:
  backend:
    ports:
      - "3002:3001"   # maps host:3002 → container:3001
```

If you remap the backend port, also update `NEXT_PUBLIC_API_URL` in `.env` to match.

---

### 26. `contract-builder` exits without producing the WASM artifact

**Symptom:** The `contract-builder` container stops and no `.wasm` file appears under
`contracts/stellarkraal/target/wasm32-unknown-unknown/release/`.

**Cause:** Rust or the `wasm32-unknown-unknown` target is missing, or the Cargo build
failed due to a compile error.

**Resolution:**
1. Check the container logs for the actual error:
   ```bash
   docker compose logs contract-builder
   ```
2. If the target is missing, the container installs it automatically at first run. If the
   image is cached from before the `rustup target add` step was added, force a rebuild:
   ```bash
   docker compose build --no-cache contract-builder
   docker compose up contract-builder
   ```
3. If there is a compile error, reproduce it locally:
   ```bash
   cd contracts/stellarkraal
   cargo build --target wasm32-unknown-unknown --release
   ```

---

### 27. `docker compose down -v` deleted database data

**Symptom:** After running `docker compose down -v`, the application starts with an empty
database and all previously registered collateral and loans are gone.

**Cause:** The `-v` flag removes all named volumes, including `postgres_data` which holds
the PostgreSQL data directory.

**Resolution:** There is no automatic recovery once the volume is deleted. To prevent this:
- Use `docker compose down` (without `-v`) to stop containers while preserving data.
- Use `docker compose down -v` only when you explicitly want a clean slate (e.g. in CI or
  after a breaking schema change).
- Take a database backup before destructive operations:
  ```bash
  docker compose exec postgres pg_dump -U postgres stellarkraal > backup.sql
  ```

---

### 28. Monitoring stack (`loki`, `grafana`, `prometheus`) does not start

**Symptom:** Running `docker compose up` starts the core stack but Grafana/Prometheus/Loki
are not available.

**Cause:** These services are grouped under the `monitoring` Docker Compose profile and are
not started by default.

**Resolution:**
```bash
# Start the full stack including observability
docker compose --profile monitoring up --build
```

To verify which profiles are active:
```bash
docker compose config --profiles
```

### Q5. Why does `npm install` fail with `ERESOLVE`?

Usually a Node.js version mismatch or stale lockfile. Confirm Node.js 20+, then remove
`node_modules` and `package-lock.json` and reinstall. See item 1 above.

---

## Freighter Wallet

StellarKraal uses the [Freighter browser extension](https://www.freighter.app/) to sign
Stellar transactions without exposing private keys to the web page. The entries in this
section cover the most common integration problems: extension not installed, network mismatch
between the wallet and the app, browser popup blocking, and user-cancelled transactions.

For the full Freighter integration reference — including the `freighterClient.ts` wrapper API,
the `useWallet` hook, mock setup for tests, and
