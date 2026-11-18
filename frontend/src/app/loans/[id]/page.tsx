/**
 * Loan detail server page.
 *
 * Exports generateMetadata so Next.js can produce page-specific <title> and
 * Open Graph tags for each loan (closes #1520). The interactive UI is handled
 * by the LoanDetailClient component, which remains a client component because
 * it relies on useEffect, useState, and useParams.
 *
 * Issue #1519: the print / PDF export button and print-only QR section live
 * inside LoanDetailClient.
 */

import type { Metadata } from 'next';
import LoanDetailClient from './LoanDetailClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const title = `Loan #${id}`;
  const description = `View details, health factor, and repayment options for StellarKraal loan #${id}.`;
  const url = `https://stellarkraal.io/loans/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} — StellarKraal`,
      description,
      url,
      images: [
        {
          url: '/og-banner.png',
          width: 1200,
          height: 630,
          alt: 'StellarKraal — Livestock Micro-Lending',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — StellarKraal`,
      description,
      images: ['/og-banner.png'],
    },
  };
}

export default function LoanDetailPage() {
  return <LoanDetailClient />;
}
