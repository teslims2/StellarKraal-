"use client";

import { useEffect, useState, useCallback } from "react";

interface Transaction {
  id: string;
  borrower: string;
  type: "loan" | "repayment" | "liquidation";
  status: "pending" | "completed" | "failed";
  amount: number;
  loanId?: string;
  collateralId?: string;
  createdAt: string;
  updatedAt: string;
}

interface PaginationData {
  data: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const TYPE_COLORS: Record<string, string> = {
  loan: "bg-blue-100 text-blue-800",
  repayment: "bg-green-100 text-green-800",
  liquidation: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-600",
  completed: "text-green-600",
  failed: "text-red-600",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "status">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      if (typeFilter) params.append("type", typeFilter);
      if (statusFilter) params.append("status", statusFilter);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const res = await fetch(`${API}/api/transactions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");

      const data: PaginationData = await res.json();
      let sorted = [...data.data];

      // Client-side sorting
      sorted.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        if (sortBy === "date") {
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
        } else if (sortBy === "amount") {
          aVal = a.amount;
          bVal = b.amount;
        } else if (sortBy === "status") {
          aVal = a.status;
          bVal = b.status;
        }

        if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
        if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });

      setTransactions(sorted);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, typeFilter, statusFilter, startDate, endDate, sortBy, sortOrder]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleExportCSV = () => {
    const headers = ["ID", "Type", "Status", "Amount", "Date", "Loan ID", "Collateral ID"];
    const rows = transactions.map((t) => [
      t.id,
      t.type,
      t.status,
      t.amount,
      t.createdAt,
      t.loanId || "",
      t.collateralId || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="w-full bg-white rounded-2xl shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-brown">Transaction History</h2>
        <button
          onClick={handleExportCSV}
          disabled={transactions.length === 0}
          className="flex items-center gap-2 bg-gold text-brown font-semibold px-4 py-2 rounded-lg hover:bg-gold/80 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-brown mb-1">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full border border-brown/30 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="loan">Loan</option>
            <option value="repayment">Repayment</option>
            <option value="liquidation">Liquidation</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-brown mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full border border-brown/30 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-brown mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="w-full border border-brown/30 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-brown mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="w-full border border-brown/30 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-brown mb-1">Sort By</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "date" | "amount" | "status")}
            className="border border-brown/30 rounded-lg px-3 py-2 text-sm"
          >
            <option value="date">Date</option>
            <option value="amount">Amount</option>
            <option value="status">Status</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-brown mb-1">Order</label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
            className="border border-brown/30 rounded-lg px-3 py-2 text-sm"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      {/* Table */}
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brown/20">
              <th className="text-left py-3 px-4 font-semibold text-brown">Date</th>
              <th className="text-left py-3 px-4 font-semibold text-brown">Type</th>
              <th className="text-left py-3 px-4 font-semibold text-brown">Amount</th>
              <th className="text-left py-3 px-4 font-semibold text-brown">Status</th>
              <th className="text-center py-3 px-4 font-semibold text-brown">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-brown/60">
                  Loading...
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-brown/60">
                  No transactions found
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tbody key={tx.id}>
                  <tr className="border-b border-brown/10 hover:bg-cream/50 transition">
                    <td className="py-3 px-4">{formatDate(tx.createdAt)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${TYPE_COLORS[tx.type]}`}>
                        {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-brown">{formatAmount(tx.amount)}</td>
                    <td className={`py-3 px-4 font-semibold ${STATUS_COLORS[tx.status]}`}>
                      {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-brown/10 transition"
                      >
                        <svg
                          className={`w-5 h-5 text-brown transition-transform ${expandedId === tx.id ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                  {expandedId === tx.id && (
                    <tr className="bg-cream/30 border-b border-brown/10">
                      <td colSpan={5} className="py-4 px-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs font-semibold text-brown/60 uppercase">Transaction ID</p>
                            <p className="text-sm font-mono text-brown break-all">{tx.id}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-brown/60 uppercase">Borrower</p>
                            <p className="text-sm font-mono text-brown break-all">{tx.borrower}</p>
                          </div>
                          {tx.loanId && (
                            <div>
                              <p className="text-xs font-semibold text-brown/60 uppercase">Loan ID</p>
                              <p className="text-sm font-mono text-brown">{tx.loanId}</p>
                            </div>
                          )}
                          {tx.collateralId && (
                            <div>
                              <p className="text-xs font-semibold text-brown/60 uppercase">Collateral ID</p>
                              <p className="text-sm font-mono text-brown">{tx.collateralId}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-brown/60 uppercase">Created</p>
                            <p className="text-sm text-brown">{formatDate(tx.createdAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-brown/60 uppercase">Updated</p>
                            <p className="text-sm text-brown">{formatDate(tx.updatedAt)}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-brown/60">
          Showing {transactions.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
          {Math.min(page * pageSize, total)} of {total} transactions
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-brown/30 rounded-lg text-brown font-semibold hover:bg-brown/5 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, page - 2) + i;
              if (pageNum > totalPages) return null;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded-lg font-semibold transition ${
                    page === pageNum
                      ? "bg-gold text-brown"
                      : "border border-brown/30 text-brown hover:bg-brown/5"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border border-brown/30 rounded-lg text-brown font-semibold hover:bg-brown/5 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
