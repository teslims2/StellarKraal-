import React from 'react';

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

const formatValue = (value: number | string, currency?: string): string => {
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

const CollateralTable: React.FC<CollateralTableProps> = ({
  items,
  onSelect,
  emptyMessage = 'No collateral items found.',
}) => {
  if (!items || items.length === 0) {
    return (
      <div className="w-full rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Card layout for mobile viewports (< md) */}
      <ul className="flex flex-col gap-3 md:hidden" role="list">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {item.assetType}
                </p>
                <p className="mt-1 break-words text-xs text-gray-600">
                  {item.description}
                </p>
              </div>
              {item.status && (
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                  {item.status}
                </span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-gray-500">Estimated value</dt>
                <dd className="mt-0.5 break-words font-medium text-gray-900">
                  {formatValue(item.estimatedValue, item.currency)}
                </dd>
              </div>
            </dl>
            {onSelect && (
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="mt-3 inline-flex min-h-[44px] min-w-[44px] w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                View details
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Table layout for tablet/desktop viewports (>= md) */}
      <div className="hidden w-full overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Asset type
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Description
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Estimated value
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Status
              </th>
              {onSelect && (
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {item.assetType}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{item.description}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                  {formatValue(item.estimatedValue, item.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                  {item.status ?? '—'}
                </td>
                {onSelect && (
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-3 py-2 font-medium text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      View
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CollateralTable;
