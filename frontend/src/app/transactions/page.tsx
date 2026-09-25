import type { Metadata } from 'next';
import TransactionHistoryClient from './TransactionHistoryClient';

export const metadata: Metadata = {
  title: 'Transaction History — StellarKraal',
  description:
    'View a complete record of your on-chain loan transactions. Filter by type and date range, and export to CSV.',
  alternates: { canonical: 'https://stellarkraal.io/transactions' },
  openGraph: {
    title: 'Transaction History — StellarKraal',
    description:
      'View a complete record of your on-chain loan transactions. Filter by type and date range, and export to CSV.',
    url: 'https://stellarkraal.io/transactions',
  },
};

export default function TransactionsPage() {
  return <TransactionHistoryClient />;
}
