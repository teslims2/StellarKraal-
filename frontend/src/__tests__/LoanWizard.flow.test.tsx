import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import LoanWizard from '../components/wizard/LoanWizard';
import { ToastProvider } from '../components/toast';

jest.mock('../lib/freighterClient', () => ({
  signTransaction: jest.fn(),
}));

jest.mock('../lib/stellarUtils', () => ({
  submitSignedXdr: jest.fn(),
}));

jest.mock('../hooks/useCurrencyConversion', () => ({
  useCurrencyConversion: () => ({
    rates: null,
    loading: false,
    error: null,
    isStale: false,
    convert: () => null,
    refresh: jest.fn(),
  }),
}));

import { signTransaction } from '../lib/freighterClient';
import { submitSignedXdr } from '../lib/stellarUtils';

const mockSignTransaction = signTransaction as jest.Mock;
const mockSubmitSignedXdr = submitSignedXdr as jest.Mock;

expect.extend(toHaveNoViolations);

const COLLATERAL_ID = '101';
const LOAN_ID = '1';

type JsonResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

function jsonResponse(body: unknown): JsonResponse {
  return { ok: true, status: 200, json: async () => body };
}

function stubFetch() {
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async (url: string) => {
    const target = String(url);
    if (target.includes('/api/collateral/register')) {
      return jsonResponse({ xdr: 'collateral-xdr' });
    }
    if (target.includes('/api/loan/request')) {
      return jsonResponse({ xdr: 'loan-xdr' });
    }
    if (target.includes('/api/v1/loans/estimate')) {
      return jsonResponse({ originationFee: 250_000, totalAmount: 5_250_000 });
    }
    return jsonResponse({});
  });
}

function renderWizard() {
  return render(
    <ToastProvider>
      <LoanWizard walletAddress="GTESTWALLET" />
    </ToastProvider>
  );
}

function currentStepLabel() {
  return screen.getByText(/^Step \d of 4$/);
}

function hasAriaCurrent(item: HTMLElement) {
  return Array.from(item.querySelectorAll('[aria-current]')).length > 0;
}

async function fillCollateral(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/animal type/i), 'goat');
  await user.clear(screen.getByLabelText('Count'));
  await user.type(screen.getByLabelText('Count'), '4');
  await user.clear(screen.getByLabelText(/appraised value/i));
  await user.type(screen.getByLabelText(/appraised value/i), '10000000');
}

async function goToStep2(user: ReturnType<typeof userEvent.setup>) {
  await fillCollateral(user);
  await user.click(screen.getByRole('button', { name: /register & continue/i }));
  await waitFor(() => expect(currentStepLabel()).toHaveTextContent('Step 2 of 4'));
}

async function enterLoanAmount(user: ReturnType<typeof userEvent.setup>, amount: string) {
  const input = screen.getByLabelText(/loan amount in stroops/i);
  await user.clear(input);
  await user.type(input, amount);
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  stubFetch();
  let submissions = 0;
  mockSignTransaction.mockResolvedValue({ signedTxXdr: 'signed-xdr' });
  mockSubmitSignedXdr.mockImplementation(async () =>
    submissions++ === 0 ? COLLATERAL_ID : LOAN_ID
  );
});

describe('LoanWizard progress indicator', () => {
  it('announces the current step out of the total on step 1', () => {
    renderWizard();
    const progress = screen.getByRole('progressbar', { name: /loan request progress/i });
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemin', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '4');
    expect(progress).toHaveAttribute('aria-valuetext', 'Step 1 of 4: Collateral');
    expect(currentStepLabel()).toHaveTextContent('Step 1 of 4');
    expect(currentStepLabel()).toHaveAttribute('aria-live', 'polite');
  });

  it('labels every step and marks only the active one with aria-current', () => {
    renderWizard();
    const steps = within(screen.getByRole('list', { name: /loan request steps/i })).getAllByRole(
      'listitem'
    );
    expect(steps).toHaveLength(4);
    expect(steps.map((item) => item.textContent)).toEqual([
      '1Collateral',
      '2Amount',
      '3Review',
      '4Confirm',
    ]);
    expect(screen.getByText('Collateral')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Amount')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Review')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Confirm')).not.toHaveAttribute('aria-current');
  });

  it('has no accessibility violations in the progress header', async () => {
    const { container } = renderWizard();
    const header = container.querySelector('ol')?.parentElement as HTMLElement;
    expect(await axe(header)).toHaveNoViolations();
  });

  it('moves aria-current and the step count as the wizard advances', async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    const steps = within(screen.getByRole('list', { name: /loan request steps/i })).getAllByRole(
      'listitem'
    );
    expect(currentStepLabel()).toHaveTextContent('Step 2 of 4');
    expect(screen.getByRole('progressbar', { name: /loan request progress/i })).toHaveAttribute(
      'aria-valuenow',
      '2'
    );
    expect(steps.filter(hasAriaCurrent).map((item) => item.textContent)).toEqual(['2Amount']);
  });
});

describe('LoanWizard navigation and data retention', () => {
  it('keeps the collateral entered on step 1 when navigating forward and back', async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);

    await user.click(screen.getByRole('button', { name: /back/i }));

    expect(currentStepLabel()).toHaveTextContent('Step 1 of 4');
    expect(screen.getByLabelText(/animal type/i)).toHaveValue('goat');
    expect(screen.getByLabelText('Count')).toHaveValue(4);
    expect(screen.getByLabelText(/appraised value/i)).toHaveValue(10000000);
  });

  it('keeps the loan amount when stepping forward and back again', async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);
    await enterLoanAmount(user, '5000000');

    await user.click(screen.getByRole('button', { name: /review terms/i }));
    expect(currentStepLabel()).toHaveTextContent('Step 3 of 4');

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(currentStepLabel()).toHaveTextContent('Step 2 of 4');
    expect(screen.getByLabelText(/loan amount in stroops/i)).toHaveValue('5,000,000');
  });

  it('carries the registered collateral id and loan amount through to the review step', async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);
    await enterLoanAmount(user, '5000000');
    await user.click(screen.getByRole('button', { name: /review terms/i }));

    await user.click(screen.getByRole('button', { name: /show full terms/i }));
    expect(screen.getByText('Collateral ID').parentElement).toHaveTextContent(COLLATERAL_ID);
    expect(screen.getByText('Loan Amount').parentElement).toHaveTextContent('5,000,000');
  });
});

describe('LoanWizard cancel', () => {
  it('returns to step 1 and clears the entered data', async () => {
    const user = userEvent.setup();
    renderWizard();
    await goToStep2(user);
    await enterLoanAmount(user, '5000000');

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(currentStepLabel()).toHaveTextContent('Step 1 of 4');
    expect(screen.getByLabelText('Count')).toHaveValue(null);
    expect(screen.getByLabelText(/appraised value/i)).toHaveValue(null);
    expect(screen.queryByLabelText(/loan amount in stroops/i)).toBeNull();
  });

  it('discards the autosaved draft so it is not restored later', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWizard();
    await goToStep2(user);
    await waitFor(
      () =>
        expect(JSON.parse(localStorage.getItem('loan_wizard_state') as string).data.count).toBe(
          '4'
        ),
      { timeout: 3000 }
    );

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(localStorage.getItem('loan_wizard_state')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(localStorage.getItem('loan_wizard_state')).toBeNull();

    unmount();
    renderWizard();
    expect(currentStepLabel()).toHaveTextContent('Step 1 of 4');
  });
});

describe('LoanWizard successful submission', () => {
  async function submitLoan(user: ReturnType<typeof userEvent.setup>) {
    await goToStep2(user);
    await enterLoanAmount(user, '5000000');
    await user.click(screen.getByRole('button', { name: /review terms/i }));
    await user.click(screen.getByRole('button', { name: /confirm & submit/i }));
    await waitFor(() => expect(currentStepLabel()).toHaveTextContent('Step 4 of 4'));
    await user.click(screen.getByRole('button', { name: /submit loan request/i }));
  }

  it('shows the loan id returned by the network and clears the wizard state', async () => {
    const user = userEvent.setup();
    renderWizard();
    await submitLoan(user);

    await waitFor(() => expect(screen.getByText(/Loan Disbursed!/i)).toBeInTheDocument());
    expect(mockSignTransaction).toHaveBeenCalled();
    expect(mockSubmitSignedXdr).toHaveBeenCalledWith('signed-xdr');
    expect(screen.getByText('Loan ID').nextElementSibling).toHaveTextContent(LOAN_ID);

    expect(currentStepLabel()).toHaveTextContent('Step 1 of 4');
    expect(screen.getByLabelText('Count')).toHaveValue(null);
    expect(screen.getByLabelText(/appraised value/i)).toHaveValue(null);
    expect(localStorage.getItem('loan_wizard_state')).toBeNull();
  });

  it('keeps the loan state and shows the error when submission fails', async () => {
    const user = userEvent.setup();
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async (url: string) => {
      const target = String(url);
      if (target.includes('/api/collateral/register')) return jsonResponse({ xdr: 'x' });
      if (target.includes('/api/loan/request')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return jsonResponse({ originationFee: 250_000, totalAmount: 5_250_000 });
    });
    renderWizard();
    await submitLoan(user);

    expect(await screen.findByText('Loan request failed. Please try again.')).toBeInTheDocument();
    expect(currentStepLabel()).toHaveTextContent('Step 4 of 4');
    expect(screen.getByText('Collateral ID').nextElementSibling).toHaveTextContent(COLLATERAL_ID);
    expect(screen.getByText('0.5 XLM')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit loan request/i })).toBeEnabled();
  });
});
