import React from 'react';
import Link from 'next/link';
import DataTable, { type ColumnDef, type RowAction } from './DataTable';

export interface CollateralItem {
  id: string;
  assetType: string;
  description: string;
  estimatedValue: number | string;
  currency?: string;
  status?: string;
}

interface CollateralTableProps {
  items: CollateralItem[];
  onSelect?: (item: CollateralItem) => void;
  emptyMessage?: string;
}

const formatValue = (value: number | string | undefined, currency?: string): string => {
  if (value == null) return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) {
    return String(value);
  }
  const formatted = numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
};

const COLUMNS: ColumnDef<CollateralItem>[] = [
  { key: 'assetType', label: 'Asset type', className: 'font-medium' },
  { key: 'description', label: 'Description', className: 'max-w-xs truncate' },
  {
    key: 'estimatedValue',
    label: 'Estimated value',
    render: (value, item) => formatValue(value, item.currency),
    sortValue: (item) => Number(item.estimatedValue),
  },
  { key: 'status', label: 'Status', render: (value) => (value as string) || '—' },
];

/**
 * Collateral list built on the shared, sortable DataTable (#1447).
 * The component keeps its original props so existing callers need no changes.
 */
const CollateralTable: React.FC<CollateralTableProps> = ({
  items,
  onSelect,
  emptyMessage = 'No collateral items found.',
}) => {
  const actions: RowAction<CollateralItem>[] = onSelect
    ? [{ label: 'View', onClick: onSelect, variant: 'primary' }]
    : [];

  const emptyState = (
    <div className="flex flex-col items-center gap-3 py-4">
      <p>{emptyMessage}</p>
      <Link
        href="/collateral/new"
        className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-gold px-4 py-2 text-sm font-semibold text-brown transition hover:bg-gold/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        Register collateral
      </Link>
    </div>
  );

  return (
    <DataTable
      columns={COLUMNS}
      data={items ?? []}
      rowKey={(item) => item.id}
      caption="Collateral items"
      actions={actions}
      emptyState={emptyState}
    />
  );
};

export default CollateralTable;
