"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "./EmptyState";
import { EmptyTransactionsIllustration } from "./illustrations";

interface Transaction {
  id: number;
  loan_id: number;
  amount: number;
  created_at: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function TransactionHistory({ walletAddress }: { walletAddress: string }) {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/transactions?borrower=${walletAddress}`)
      .then((r) => r.json())
      .then((body) => {
        setTransactions(Array.isArray(body?.data) ? body.data : []);
      })
      .catch(() => setTransactions([]))
      .finally(() => setLoaded(true));
  }, [walletAddress]);

  if (!loaded) return null;

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow mb-4">
        <h2 className="text-xl font-semibold text-brown mb-3">Transactions</h2>
        <EmptyState
          illustration={<EmptyTransactionsIllustration />}
          message="No transactions yet"
          ctaLabel="View Loans"
          onCta={() => router.push("/dashboard")}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow mb-4">
      <h2 className="text-xl font-semibold text-brown mb-3">Transactions</h2>
      <ul className="space-y-2">
        {transactions.map((tx) => (
          <li key={tx.id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-sm text-brown/80 border-b border-brown/10 pb-2">
            <span className="font-medium">Loan #{tx.loan_id}</span>
            <span className="text-brown/60">{tx.amount.toLocaleString()} stroops</span>
            <span className="text-brown/50 text-xs self-end">{new Date(tx.created_at).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
