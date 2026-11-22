/**
 * Collateral detail page — server wrapper.
 *
 * Exports generateMetadata for page-specific SEO and Open Graph tags.
 * The interactive UI is rendered by CollateralDetailClient.
 *
 * Closes #1520 (metadata API).
 */
import type { Metadata } from 'next';
import CollateralDetailClient from './CollateralDetailClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: `Collateral #${id}`,
    description: `View appraisal details, linked loans, and on-chain status for collateral item ${id} on StellarKraal.`,
    alternates: { canonical: `https://stellarkraal.io/dashboard/collateral/${id}` },
    openGraph: {
      title: `Collateral #${id} — StellarKraal`,
      description: `Livestock collateral item ${id}: appraisal value, linked loans, and registration details.`,
      url: `https://stellarkraal.io/dashboard/collateral/${id}`,
      images: [
        {
          url: '/og-banner.png',
          width: 1200,
          height: 630,
          alt: `StellarKraal collateral #${id}`,
        },
      ],
    },
  };
}

export default function CollateralDetailPage() {
  return <CollateralDetailClient />;
}
