/**
 * Lightweight in-memory store with soft delete support.
 * Provides audit trail for loans and collateral records.
 * Migration: adds deletedAt timestamp to all records.
 */

export interface CollateralRecord {
  id: string;
  owner: string;
  animal_type: string;
  count: number;
  appraised_value: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface LoanRecord {
  id: string;
  borrower: string;
  collateral_id: string;
  amount: number;
  createdAt: string;
  deletedAt: string | null;
}

export type TransactionType = "loan" | "repayment" | "liquidation";
export type TransactionStatus = "pending" | "completed" | "failed";

export interface TransactionRecord {
  id: string;
  borrower: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  loanId?: string;
  collateralId?: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory tables (replace with a real DB in production)
const collateralTable: Map<string, CollateralRecord> = new Map();
const loanTable: Map<string, LoanRecord> = new Map();
const transactionTable: Map<string, TransactionRecord> = new Map();

// ── Collateral ────────────────────────────────────────────────────────────────

export function insertCollateral(data: Omit<CollateralRecord, "createdAt" | "deletedAt">): CollateralRecord {
  const record: CollateralRecord = { ...data, createdAt: new Date().toISOString(), deletedAt: null };
  collateralTable.set(record.id, record);
  return record;
}

export function listCollateral(): CollateralRecord[] {
  return [...collateralTable.values()].filter((r) => r.deletedAt === null);
}

export function getCollateral(id: string): CollateralRecord | undefined {
  const r = collateralTable.get(id);
  return r && r.deletedAt === null ? r : undefined;
}

export function softDeleteCollateral(id: string): boolean {
  const r = collateralTable.get(id);
  if (!r || r.deletedAt !== null) return false;
  r.deletedAt = new Date().toISOString();
  return true;
}

export function restoreCollateral(id: string): boolean {
  const r = collateralTable.get(id);
  if (!r || r.deletedAt === null) return false;
  r.deletedAt = null;
  return true;
}

export function listDeletedCollateral(): CollateralRecord[] {
  return [...collateralTable.values()].filter((r) => r.deletedAt !== null);
}

// ── Loans ─────────────────────────────────────────────────────────────────────

export function insertLoan(data: Omit<LoanRecord, "createdAt" | "deletedAt">): LoanRecord {
  const record: LoanRecord = { ...data, createdAt: new Date().toISOString(), deletedAt: null };
  loanTable.set(record.id, record);
  return record;
}

export function listLoans(): LoanRecord[] {
  return [...loanTable.values()].filter((r) => r.deletedAt === null);
}

export function getLoan(id: string): LoanRecord | undefined {
  const r = loanTable.get(id);
  return r && r.deletedAt === null ? r : undefined;
}

export function softDeleteLoan(id: string): boolean {
  const r = loanTable.get(id);
  if (!r || r.deletedAt !== null) return false;
  r.deletedAt = new Date().toISOString();
  return true;
}

export function restoreLoan(id: string): boolean {
  const r = loanTable.get(id);
  if (!r || r.deletedAt === null) return false;
  r.deletedAt = null;
  return true;
}

export function listDeletedLoans(): LoanRecord[] {
  return [...loanTable.values()].filter((r) => r.deletedAt !== null);
}

// ── Migration helper (documents schema intent) ────────────────────────────────

/**
 * Migration 001: Add deletedAt column to loans and collateral tables.
 * For a real DB this would be a SQL migration script.
 * Schema:
 *   ALTER TABLE collateral ADD COLUMN deletedAt TEXT DEFAULT NULL;
 *   ALTER TABLE loans      ADD COLUMN deletedAt TEXT DEFAULT NULL;
 *   CREATE INDEX idx_collateral_deleted ON collateral(deletedAt);
 *   CREATE INDEX idx_loans_deleted      ON loans(deletedAt);
 */
export function runMigrations(): void {
  // No-op for in-memory store; documents intent for real DB migration
}


// ── Transactions ──────────────────────────────────────────────────────────────

export function insertTransaction(data: Omit<TransactionRecord, "id" | "createdAt" | "updatedAt">): TransactionRecord {
  const id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  const record: TransactionRecord = { ...data, id, createdAt: now, updatedAt: now };
  transactionTable.set(record.id, record);
  return record;
}

export function listTransactions(filters?: {
  borrower?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}): { data: TransactionRecord[]; total: number; page: number; pageSize: number } {
  const pageSize = filters?.pageSize || 20;
  const page = filters?.page || 1;
  
  let results = [...transactionTable.values()];

  if (filters?.borrower) {
    results = results.filter((t) => t.borrower === filters.borrower);
  }
  if (filters?.type) {
    results = results.filter((t) => t.type === filters.type);
  }
  if (filters?.status) {
    results = results.filter((t) => t.status === filters.status);
  }
  if (filters?.startDate) {
    results = results.filter((t) => new Date(t.createdAt) >= new Date(filters.startDate!));
  }
  if (filters?.endDate) {
    results = results.filter((t) => new Date(t.createdAt) <= new Date(filters.endDate!));
  }

  // Sort by date descending (newest first)
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = results.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const data = results.slice(start, end);

  return { data, total, page, pageSize };
}

export function getTransaction(id: string): TransactionRecord | undefined {
  return transactionTable.get(id);
}

export function updateTransaction(id: string, updates: Partial<Omit<TransactionRecord, "id" | "createdAt">>): TransactionRecord | undefined {
  const record = transactionTable.get(id);
  if (!record) return undefined;
  const updated = { ...record, ...updates, updatedAt: new Date().toISOString() };
  transactionTable.set(id, updated);
  return updated;
}
