-- Migration 002: Add soft delete support to loans and collaterals tables

ALTER TABLE collaterals ADD COLUMN IF NOT EXISTS "deleted_at" TEXT DEFAULT NULL;
ALTER TABLE loans       ADD COLUMN IF NOT EXISTS "deleted_at" TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_collaterals_deleted ON collaterals("deleted_at");
CREATE INDEX IF NOT EXISTS idx_loans_deleted       ON loans("deleted_at");
