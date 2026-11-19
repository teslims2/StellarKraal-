#!/usr/bin/env ts-node
/**
 * scripts/verify-deployment.ts
 *
 * Post-deploy verification script for StellarKraal contract.
 * Exits with code 1 if any check fails.
 *
 * Usage:
 *   RPC_URL=... CONTRACT_ID=... ADMIN_ADDRESS=... ts-node scripts/verify-deployment.ts
 *   NEXT_PUBLIC_NETWORK=mainnet ... ts-node scripts/verify-deployment.ts
 */

import {
  Networks,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  nativeToScVal,
  SorobanRpc,
} from "@stellar/stellar-sdk";

const { Server } = SorobanRpc;

// Optional: node-postgres is only required when a direct DB migration check is
// performed. It is loaded lazily so the contract checks still work without it.
type PgClient = {
  connect: () => Promise<void>;
  query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};

// ── Config ────────────────────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.CONTRACT_ID || "";
const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS || "";
const NETWORK =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
const NETWORK_PASSPHRASE =
  NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

// Migration status sources (checked in order of preference):
//   1. MIGRATION_STATUS_URL — HTTP endpoint exposing migration state
//   2. DATABASE_URL         — direct query of the knex_migrations table
const MIGRATION_STATUS_URL = process.env.MIGRATION_STATUS_URL || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const MIGRATIONS_TABLE = process.env.MIGRATIONS_TABLE || "knex_migrations";
const MIGRATIONS_LOCK_TABLE =
  process.env.MIGRATIONS_LOCK_TABLE || "knex_migrations_lock";

// Fee-less read-only account (well-known testnet/mainnet horizon account)
const READ_ACCOUNT =
  NETWORK === "mainnet"
    ? "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
    : "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label: string, reason?: string) {
  console.error(`  ❌ ${label}${reason ? `: ${reason}` : ""}`);
  failed++;
}

async function simulateRead(
  server: SorobanRpc.Server,
  method: string,
  args: ReturnType<typeof nativeToScVal>[]
): Promise<unknown> {
  const account = await server.getAccount(READ_ACCOUNT);
  const contract = new Contract(CONTRACT_ID);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const result = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(result)) {
    throw new Error(result.error);
  }
  return (result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result
    ?.retval;
}

// ── Checks ────────────────────────────────────────────────────────────────────
async function checkConfig() {
  console.log("\n[1] Configuration");
  if (!CONTRACT_ID || CONTRACT_ID === "your_deployed_contract_id") {
    fail("CONTRACT_ID is set", "missing or placeholder value");
  } else {
    ok(`CONTRACT_ID = ${CONTRACT_ID}`);
  }
  if (!ADMIN_ADDRESS) {
    fail("ADMIN_ADDRESS is set", "set ADMIN_ADDRESS env var");
  } else {
    ok(`ADMIN_ADDRESS = ${ADMIN_ADDRESS}`);
  }
  ok(`Network = ${NETWORK} (${NETWORK_PASSPHRASE.slice(0, 30)}...)`);
}

async function checkRpcConnectivity(server: SorobanRpc.Server) {
  console.log("\n[2] RPC connectivity");
  try {
    const health = await server.getHealth();
    if (health.status === "healthy") {
      ok(`RPC healthy at ${RPC_URL}`);
    } else {
      fail("RPC health", `status = ${health.status}`);
    }
  } catch (e) {
    fail("RPC reachable", (e as Error).message);
  }
}

async function checkContractResponds(server: SorobanRpc.Server) {
  console.log("\n[3] Contract responds");
  try {
    // get_loan with id=0 should return LoanNotFound — that means the contract is alive
    await simulateRead(server, "get_loan", [
      nativeToScVal(BigInt(0), { type: "u64" }),
    ]);
    // If it returns without error, that's unexpected but not fatal
    ok("Contract responds to get_loan simulation");
  } catch (e) {
    const msg = (e as Error).message;
    // LoanNotFound (error code 5) means the contract is initialized and responding
    if (msg.includes("LoanNotFound") || msg.includes("5")) {
      ok("Contract responds (LoanNotFound as expected for id=0)");
    } else {
      fail("Contract responds", msg);
    }
  }
}

async function checkHealthFactor(server: SorobanRpc.Server) {
  console.log("\n[4] health_factor read");
  try {
    await simulateRead(server, "health_factor", [
      nativeToScVal(BigInt(1), { type: "u64" }),
    ]);
    ok("health_factor simulation succeeded");
  } catch (e) {
    const msg = (e as Error).message;
    // LoanNotFound is expected on a fresh deployment — contract is responding correctly
    if (msg.includes("LoanNotFound") || msg.includes("5")) {
      ok("health_factor responds (LoanNotFound expected on fresh deploy)");
    } else {
      fail("health_factor simulation", msg);
    }
  }
}

async function checkMigrationStatus() {
  console.log("\n[6] Database migration status");

  if (!MIGRATION_STATUS_URL && !DATABASE_URL) {
    fail(
      "Migration status available",
      "set MIGRATION_STATUS_URL or DATABASE_URL to verify schema state"
    );
    return;
  }

  try {
    const status = MIGRATION_STATUS_URL
      ? await fetchMigrationStatusFromUrl()
      : await fetchMigrationStatusFromDb();

    if (status.pending.length > 0) {
      fail(
        "No pending migrations",
        `${status.pending.length} pending: ${status.pending.join(", ")}`
      );
    } else {
      ok("No pending migrations");
    }

    if (status.locked) {
      fail("Migrations not locked", "a migration is currently running or was interrupted");
    } else {
      ok("Migrations not locked");
    }

    if (status.applied.length > 0) {
      const latest = status.applied[status.applied.length - 1];
      ok(
        `${status.applied.length} migration(s) applied; latest = ${latest.name} (batch ${latest.batch})`
      );
    } else {
      fail("Migration history present", "no applied migrations recorded");
    }
  } catch (e) {
    fail("Migration status check", (e as Error).message);
  }
}

type AppliedMigration = { name: string; batch: number };

async function fetchMigrationStatusFromUrl(): Promise<{
  applied: AppliedMigration[];
  pending: string[];
  locked: boolean;
}> {
  const res = await fetch(MIGRATION_STATUS_URL, {
    headers: process.env.MIGRATION_STATUS_TOKEN
      ? { Authorization: `Bearer ${process.env.MIGRATION_STATUS_TOKEN}` }
      : undefined,
  });
  if (!res.ok) {
    throw new Error(
      `GET ${MIGRATION_STATUS_URL} returned ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as {
    applied?: AppliedMigration[];
    pending?: string[];
    locked?: boolean;
  };
  return {
    applied: body.applied ?? [],
    pending: body.pending ?? [],
    locked: body.locked ?? false,
  };
}

async function fetchMigrationStatusFromDb(): Promise<{
  applied: AppliedMigration[];
  pending: string[];
  locked: boolean;
}> {
  // Lazy require so the script does not hard-depend on pg being installed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require("pg") as {
    Client: new (config: { connectionString: string }) => PgClient;
  };
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const appliedRes = await client.query(
      `SELECT name, batch FROM ${MIGRATIONS_TABLE} ORDER BY id ASC`
    );
    const applied: AppliedMigration[] = appliedRes.rows.map((row) => ({
      name: String(row.name),
      batch: Number(row.batch),
    }));

    // Pending migrations are files on disk that have no row in the table.
    // The DB alone cannot know about them, so compare against the local
    // migrations directory when it exists.
    const pending = await findPendingMigrationFiles(
      applied.map((m) => m.name)
    );

    let locked = false;
    try {
      const lockRes = await client.query(
        `SELECT is_locked FROM ${MIGRATIONS_LOCK_TABLE} LIMIT 1`
      );
      locked = Boolean(lockRes.rows[0]?.is_locked);
    } catch {
      // Lock table may not exist yet on a fresh database — treat as unlocked.
      locked = false;
    }

    return { applied, pending, locked };
  } finally {
    await client.end();
  }
}

async function findPendingMigrationFiles(applied: string[]): Promise<string[]> {
  const fs = await import("fs");
  const path = await import("path");
  const dir = process.env.MIGRATIONS_DIR || path.join(process.cwd(), "migrations");
  if (!fs.existsSync(dir)) {
    return [];
  }
  const appliedSet = new Set(applied);
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(js|ts)$/.test(f))
    .filter((f) => !appliedSet.has(f.replace(/\.(js|ts)$/, "")))
    .sort();
}

async function checkInitializedState(server: SorobanRpc.Server) {
  console.log("\n[5] Initialized state");
  try {
    // is_initialized() is a dedicated read-only view that returns a bool.
    // true  → contract is ready to accept transactions
    // false → initialize() has not been called yet
    const result = await simulateRead(server, "is_initialized", []);
    if (result) {
      ok("Contract is initialized (is_initialized returned true)");
    } else {
      fail("Contract initialized", "is_initialized returned false — run initialize() first");
    }
  } catch (e) {
    const msg = (e as Error).message;
    fail("Contract initialized check", msg);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  StellarKraal Deployment Verification");
  console.log(`  Network : ${NETWORK}`);
  console.log(`  RPC     : ${RPC_URL}`);
  console.log("═══════════════════════════════════════════════");

  const server = new Server(RPC_URL);

  await checkConfig();
  await checkRpcConnectivity(server);
  await checkContractResponds(server);
  await checkHealthFactor(server);
  await checkInitializedState(server);
  await checkMigrationStatus();

  console.log("\n═══════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Verification script crashed:", e.message);
  process.exit(1);
});
