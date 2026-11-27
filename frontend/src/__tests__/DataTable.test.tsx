/**
 * DataTable — issue #1447
 *
 * Covers the four acceptance criteria:
 *  - typed columns config + row data
 *  - clickable headers toggle ascending / descending sort
 *  - empty-state slot renders a custom message and CTA
 *  - actions column config supports View / Repay / Liquidate style actions
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataTable, {
  type ActionsColumn,
  type ColumnDef,
  type RowAction,
} from '../components/DataTable';

interface LoanRow {
  id: string;
  amount: number;
  status: string;
}

const ROWS: LoanRow[] = [
  { id: 'loan-1', amount: 300, status: 'active' },
  { id: 'loan-2', amount: 100, status: 'repaid' },
  { id: 'loan-3', amount: 200, status: 'at_risk' },
];

const COLUMNS: ColumnDef<LoanRow>[] = [
  { key: 'id', label: 'Loan ID', sortable: false },
  { key: 'amount', label: 'Amount', render: (value) => `${value} XLM` },
  { key: 'status', label: 'Status' },
];

/** Text of a given column for each rendered data row. */
function columnValues(container: HTMLElement, columnIndex: number): string[] {
  return Array.from(container.querySelectorAll('tbody tr')).map(
    (row) => row.querySelectorAll('td')[columnIndex]?.textContent ?? ''
  );
}

function renderTable(overrides: Partial<React.ComponentProps<typeof DataTable<LoanRow>>> = {}) {
  return render(
    <DataTable
      columns={COLUMNS}
      data={ROWS}
      rowKey={(row) => row.id}
      caption="Loans"
      {...overrides}
    />
  );
}

describe('DataTable — typed columns and row data', () => {
  it('renders a header for every configured column and a cell for every row', () => {
    const { container } = renderTable();

    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getByRole('columnheader', { name: 'Loan ID' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(ROWS.length + 1); // header + rows
    expect(columnValues(container, 0)).toEqual(['loan-1', 'loan-2', 'loan-3']);
  });

  it('uses the custom cell renderer and shows an em dash for nullish values', () => {
    const { container } = renderTable({ data: [{ id: 'loan-9', amount: 50, status: 'active' }] });
    expect(container.textContent).toContain('50 XLM');

    const nullishRender = render(
      <DataTable
        columns={[{ key: 'note', label: 'Note' }]}
        data={[{ id: '1', note: undefined }]}
        rowKey={(row) => row.id}
      />
    );
    expect(columnValues(nullishRender.container, 0)).toEqual(['—']);
  });
});

describe('DataTable — sortable column headers', () => {
  it('toggles from ascending to descending when the same header is clicked twice', async () => {
    const user = userEvent.setup();
    const { container } = renderTable();
    const amountHeader = screen.getByRole('columnheader', { name: /Amount/ });

    await user.click(amountHeader);
    expect(amountHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(columnValues(container, 0)).toEqual(['loan-2', 'loan-3', 'loan-1']);

    await user.click(amountHeader);
    expect(amountHeader).toHaveAttribute('aria-sort', 'descending');
    expect(columnValues(container, 0)).toEqual(['loan-1', 'loan-3', 'loan-2']);
  });

  it('sorts strings and resets other headers to ascending', async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    await user.click(screen.getByRole('columnheader', { name: /Status/ }));
    expect(columnValues(container, 0)).toEqual(['loan-1', 'loan-3', 'loan-2']);
    expect(screen.getByRole('columnheader', { name: /Status/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });

  it('does not sort columns marked as non-sortable', async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    await user.click(screen.getByRole('columnheader', { name: 'Loan ID' }));
    expect(columnValues(container, 0)).toEqual(['loan-1', 'loan-2', 'loan-3']);
    expect(screen.getByRole('columnheader', { name: 'Loan ID' })).not.toHaveAttribute('aria-sort');
  });

  it('supports keyboard activation of a sortable header', async () => {
    const user = userEvent.setup();
    const { container } = renderTable();

    screen.getByRole('button', { name: 'Sort by Amount' }).focus();
    await user.keyboard('{Enter}');
    expect(columnValues(container, 0)).toEqual(['loan-2', 'loan-3', 'loan-1']);
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });

  it('can be controlled by a parent via sortBy / sortDir / onSortChange', async () => {
    const user = userEvent.setup();
    const onSortChange = jest.fn();
    const { container } = renderTable({
      sortBy: 'amount',
      sortDir: 'desc',
      onSortChange,
    });

    expect(columnValues(container, 0)).toEqual(['loan-1', 'loan-3', 'loan-2']);
    await user.click(screen.getByRole('columnheader', { name: /Amount/ }));
    expect(onSortChange).toHaveBeenCalledWith({ key: 'amount', direction: 'asc' });
    // Controlled props are unchanged, so the parent decides when rows reorder.
    expect(columnValues(container, 0)).toEqual(['loan-1', 'loan-3', 'loan-2']);
  });
});

describe('DataTable — empty state slot', () => {
  it('renders the custom message and CTA when data is empty', () => {
    renderTable({
      data: [],
      emptyState: (
        <>
          <p>No loans yet</p>
          <button type="button">Request your first loan</button>
        </>
      ),
    });

    expect(screen.getByText('No loans yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request your first loan' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    // Header row plus a single row holding the empty-state slot.
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('No loans yet').closest('td')).toHaveAttribute('colspan', '3');
  });

  it('falls back to the emptyMessage prop when no slot is supplied', () => {
    renderTable({ data: [], emptyMessage: 'Nothing here' });
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});

describe('DataTable — row actions column config', () => {
  const onView = jest.fn();
  const onRepay = jest.fn();
  const onLiquidate = jest.fn();

  const actions: RowAction<LoanRow>[] = [
    { label: 'View', onClick: onView },
    {
      label: 'Repay',
      onClick: onRepay,
      variant: 'primary',
      hidden: (row) => row.status === 'repaid',
    },
    {
      label: 'Liquidate',
      onClick: onLiquidate,
      variant: 'danger',
      disabled: (row) => row.amount < 200,
    },
    { label: 'Details', href: (row) => `/loans/${row.id}` },
  ];

  beforeEach(() => {
    onView.mockClear();
    onRepay.mockClear();
    onLiquidate.mockClear();
  });

  it('renders an actions header and a cell per row', async () => {
    const user = userEvent.setup();
    renderTable({ actions });

    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(3);

    await user.click(screen.getAllByRole('button', { name: 'View' })[1]);
    expect(onView).toHaveBeenCalledWith(ROWS[1]);
  });

  it('supports Repay / Liquidate actions with hidden and disabled rules', async () => {
    const user = userEvent.setup();
    renderTable({ actions });

    // The repaid loan hides its Repay action.
    expect(screen.getAllByRole('button', { name: 'Repay' })).toHaveLength(2);
    await user.click(screen.getAllByRole('button', { name: 'Repay' })[0]);
    expect(onRepay).toHaveBeenCalledWith(ROWS[0]);

    // Liquidate is disabled for the loan with an amount below 200.
    expect(screen.getAllByRole('button', { name: 'Liquidate' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Liquidate' })[0]).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Liquidate' })[1]).toBeDisabled();
    await user.click(screen.getAllByRole('button', { name: 'Liquidate' })[0]);
    expect(onLiquidate).toHaveBeenCalledWith(ROWS[0]);
  });

  it('renders link actions with a per-row href', () => {
    renderTable({ actions });
    const links = screen.getAllByRole('link', { name: 'Details' });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', '/loans/loan-1');
    expect(links[2]).toHaveAttribute('href', '/loans/loan-3');
  });

  it('also accepts an actions column declared in the columns config', async () => {
    const user = userEvent.setup();
    const inlineActions: ActionsColumn<LoanRow> = {
      type: 'actions',
      label: 'Loan actions',
      actions: [{ label: 'Liquidate', onClick: onLiquidate, variant: 'danger' }],
    };
    renderTable({ columns: [...COLUMNS, inlineActions] });

    expect(screen.getByRole('columnheader', { name: 'Loan actions' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Liquidate' })[0]);
    expect(onLiquidate).toHaveBeenCalledWith(ROWS[0]);
  });
});
