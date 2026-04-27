-- Migration 002: Remove soft delete columns (down)
-- Note: SQLite does not support DROP COLUMN before 3.35.0.
-- For SQLite < 3.35: recreate tables without the deleted_at column.
-- For PostgreSQL / MySQL:
DROP INDEX IF EXISTS idx_collaterals_deleted;
DROP INDEX IF EXISTS idx_loans_deleted;
ALTER TABLE collaterals DROP COLUMN IF EXISTS "deleted_at";
ALTER TABLE loans       DROP COLUMN IF EXISTS "deleted_at";
