/**
 * Collateral detail server page.
 *
 * Exports generateMetadata for page-specific SEO and Open Graph tags
 * (closes #1520). Interactive UI is handled by CollateralDetailClient.
 */

import type { Metadata } from 'next';
import CollateralDetailClient from './CollateralDetailClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const title = `Collateral #${id}`;
  const description = `View appraisal history, valuation, and loan status for StellarKraal collateral asset #${id}.`;
  const url = `https://stellarkraal.io/collateral/${id}`;

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

export default function CollateralDetailPage() {
  return <CollateralDetailClient />;
}
