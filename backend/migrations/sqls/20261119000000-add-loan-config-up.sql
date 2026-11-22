-- Runtime-configurable loan origination fee (#1533).
-- A single-row config table holds the origination fee in basis points so
-- administrators can change it without a redeploy. Loans snapshot the fee
-- that was active at origination, so updating this row never alters an
-- already-disbursed loan.
CREATE TABLE IF NOT EXISTS loan_config (
  id                   INTEGER PRIMARY KEY,
  origination_fee_bps  INTEGER NOT NULL CHECK (origination_fee_bps >= 0)
);

-- Seed the default (50 bps == 0.5%) idempotently. ON CONFLICT works on both
-- SQLite (>=3.24) and PostgreSQL, so re-running the migration after a
-- rollback+up does not duplicate or fail.
INSERT INTO loan_config (id, origination_fee_bps) VALUES (1, 50)
  ON CONFLICT (id) DO NOTHING;
