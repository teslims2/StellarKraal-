/**
 * Loan detail page — server wrapper.
 *
 * Exports generateMetadata so Next.js can produce page-specific <title>,
 * <meta description>, and Open Graph tags for each loan. The interactive UI
 * is rendered by LoanDetailClient (a 'use client' component).
 *
 * Closes #1519 (print/PDF), #1520 (metadata API).
 */
import type { Metadata } from 'next';
import LoanDetailClient, { StickyLoanAction } from './LoanDetailClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: `Loan #${id}`,
    description: `View the terms, collateral details, repayment status, and health factor for loan ${id} on StellarKraal.`,
    alternates: { canonical: `https://stellarkraal.io/loans/${id}` },
    openGraph: {
      title: `Loan #${id} — StellarKraal`,
      description: `Livestock-backed micro-loan ${id}: collateral details, repayment terms, and on-chain status.`,
      url: `https://stellarkraal.io/loans/${id}`,
      images: [
        {
          url: '/og-banner.png',
          width: 1200,
          height: 630,
          alt: `StellarKraal loan #${id}`,
        },
      ],
    },
  };
}

export default function LoanDetailPage() {
  return <LoanDetailClient />;
}

export { StickyLoanAction };
