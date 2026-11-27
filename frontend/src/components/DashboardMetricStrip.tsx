'use client';

import Link from 'next/link';
import { ArrowUpRight, Beef, ClipboardList, ShieldAlert, type LucideIcon } from 'lucide-react';
import { formatXlmFromStroops } from '@/lib/formatMoney';
import type { BorrowerLoan } from '@/hooks/useBorrowerPortfolio';
import type { Collateral } from '@/hooks/useCollateral';

interface Props {
  loans: BorrowerLoan[];
  collaterals: Collateral[];
  atRiskCount: number;
  loading?: boolean;
}

interface MetricCardProps {
  label: string;
  value: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: 'positive' | 'neutral' | 'critical';
  loading: boolean;
}

const TONE_STYLES = {
  positive: {
    icon: 'bg-emerald-100 text-emerald-800',
    value: 'text-emerald-900',
    border: 'border-emerald-200',
  },
  neutral: {
    icon: 'bg-blue-100 text-blue-800',
    value: 'text-brown',
    border: 'border-brown/15',
  },
  critical: {
    icon: 'bg-rose-100 text-rose-800',
    value: 'text-rose-800',
    border: 'border-rose-300',
  },
};

function MetricCard({
  label,
  value,
  description,
  href,
  icon: Icon,
  tone,
  loading,
}: MetricCardProps) {
  const styles = TONE_STYLES[tone];

  return (
    <Link
      href={href}
      aria-label={`${label}: ${loading ? 'loading' : value}. ${description}`}
      aria-busy={loading}
      className={`group flex min-w-0 items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)] ${styles.border}`}
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>
        <Icon aria-hidden="true" size={23} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-brown/70">{label}</span>
        <span className={`mt-0.5 block truncate text-2xl font-bold ${styles.value}`}>
          {loading ? '—' : value}
        </span>
        <span className="mt-1 block text-xs text-brown/60">{description}</span>
      </span>
      <ArrowUpRight
        aria-hidden="true"
        size={18}
        className="shrink-0 text-brown/40 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

export default function DashboardMetricStrip({
  loans,
  collaterals,
  atRiskCount,
  loading = false,
}: Props) {
  const activeLoanCount = loans.filter(
    (loan) => !['repaid', 'liquidated'].includes(loan.status.toLowerCase()),
  ).length;
  const totalCollateralValue = collaterals.reduce(
    (total, item) => total + (Number.isFinite(item.appraised_value) ? item.appraised_value : 0),
    0,
  );

  return (
    <section aria-label="Portfolio summary" className="mb-6 px-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Active loans"
          value={String(activeLoanCount)}
          description="View your loan portfolio"
          href="/loans"
          icon={ClipboardList}
          tone="positive"
          loading={loading}
        />
        <MetricCard
          label="Total collateral value"
          value={formatXlmFromStroops(totalCollateralValue)}
          description="View pledged and available collateral"
          href="/collateral"
          icon={Beef}
          tone="neutral"
          loading={loading}
        />
        <MetricCard
          label="At-risk loans"
          value={String(atRiskCount)}
          description={atRiskCount > 0 ? 'Health factor needs attention' : 'No loans need attention'}
          href="/loans"
          icon={ShieldAlert}
          tone={atRiskCount > 0 ? 'critical' : 'positive'}
          loading={loading}
        />
      </div>
    </section>
  );
}
