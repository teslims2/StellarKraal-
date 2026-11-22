/**
 * Integration test for the loan request wizard (#1532).
 *
 * Drives the real LoanWizard + LoanWizardContext through all four steps
 * (Collateral → Amount → Review → Confirm) and asserts the per-step form
 * validation gates advancement. The step components are stubbed so the test
 * is insulated from their internal DOM, but each stub wires its inputs and
 * the Continue action through the *real* `useWizard()` context — so the
 * `canProceed()` validation under test is the production logic.
 *
 * The autosave/persist hooks are mocked to no-ops so the wizard starts at
 * step 1 with empty fields (no localStorage/sessionStorage restore, no
 * autosave intervals) for deterministic assertions.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoanWizard from '../components/wizard/LoanWizard';
import { useWizard } from '@/context/LoanWizardContext';
import type { SubmittedLoan } from '@/context/LoanWizardContext';

jest.mock('@/hooks/useFormAutoSave', () => ({
  useFormAutoSave: () => ({
    restoreSavedData: () => null,
    clearSavedData: () => undefined,
  }),
}));
jest.mock('@/hooks/useWizardPersist', () => ({
  useWizardPersist: () => ({
    persist: () => undefined,
    restore: () => null,
    clear: () => undefined,
  }),
}));

// ── Step stubs wired to the real wizard context ───────────────────────────────
function StepCollateralStub() {
  const { setField, nextStep } = useWizard();
  return (
    <div>
      <h2>Collateral step content</h2>
      <label>
        Count
        <input
          type="number"
          aria-label="Count"
          onChange={(e) => setField('count', e.target.value)}
        />
      </label>
      <label>
        Appraised Value
        <input
          type="number"
          aria-label="Appraised Value"
          onChange={(e) => setField('appraisedValue', e.target.value)}
        />
      </label>
      <button type="button" onClick={nextStep}>
        Continue
      </button>
    </div>
  );
}

function StepAmountStub() {
  const { setField, nextStep } = useWizard();
  return (
    <div>
      <h2>Amount step content</h2>
      <label>
        Loan Amount
        <input
          type="number"
          aria-label="Loan Amount"
          onChange={(e) => setField('loanAmount', e.target.value)}
        />
      </label>
      <button type="button" onClick={nextStep}>
        Continue
      </button>
    </div>
  );
}

function StepReviewStub() {
  const { nextStep } = useWizard();
  return (
    <div>
      <h2>Review step content</h2>
      <button type="button" onClick={nextStep}>
        Continue
      </button>
    </div>
  );
}

function StepConfirmStub({ onSubmitted }: { onSubmitted: (loan: SubmittedLoan) => void }) {
  return (
    <div>
      <h2>Confirm step content</h2>
      <button
        type="button"
        onClick={() =>
          onSubmitted({ loanId: 'L1', amount: 5_000_000, termDays: '30', totalRepay: 5_250_000 })
        }
      >
        Submit Loan
      </button>
    </div>
  );
}

jest.mock('../components/wizard/steps/StepCollateral', () => ({
  __esModule: true,
  default: StepCollateralStub,
}));
jest.mock('../components/wizard/steps/StepAmount', () => ({
  __esModule: true,
  default: StepAmountStub,
}));
jest.mock('../components/wizard/steps/StepReview', () => ({
  __esModule: true,
  default: StepReviewStub,
}));
jest.mock('../components/wizard/steps/StepConfirm', () => ({
  __esModule: true,
  default: StepConfirmStub,
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('LoanWizard — four-step flow with form validation (#1532)', () => {
  it('starts on step 1 and blocks advancement until collateral fields are valid', async () => {
    const user = userEvent.setup();
    render(<LoanWizard walletAddress="GTEST" />);

    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
    expect(screen.getByText('Collateral step content')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');

    // Empty inputs → Continue must not advance past step 1.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();

    // Fill valid collateral → advance to step 2.
    await user.type(screen.getByLabelText('Count'), '2');
    await user.type(screen.getByLabelText('Appraised Value'), '1000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Step 2 of 4/)).toBeInTheDocument();
    expect(screen.getByText('Amount step content')).toBeInTheDocument();
  });

  it('blocks step 2 → step 3 until a positive loan amount is entered', async () => {
    const user = userEvent.setup();
    render(<LoanWizard walletAddress="GTEST" />);

    // Drive to step 2.
    await user.type(screen.getByLabelText('Count'), '2');
    await user.type(screen.getByLabelText('Appraised Value'), '1000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Step 2 of 4/)).toBeInTheDocument();

    // No loan amount → Continue must not advance.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument();

    // Enter a loan amount → advance to step 3 (Review).
    await user.type(screen.getByLabelText('Loan Amount'), '5000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Step 3 of 4/)).toBeInTheDocument();
    expect(screen.getByText('Review step content')).toBeInTheDocument();
  });

  it('advances from Review to Confirm (steps 3 and 4 need no extra input)', async () => {
    const user = userEvent.setup();
    render(<LoanWizard walletAddress="GTEST" />);

    await user.type(screen.getByLabelText('Count'), '2');
    await user.type(screen.getByLabelText('Appraised Value'), '1000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Loan Amount'), '5000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 3 — Review.
    expect(await screen.findByText(/Step 3 of 4/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 4 — Confirm.
    expect(await screen.findByText(/Step 4 of 4/)).toBeInTheDocument();
    expect(screen.getByText('Confirm step content')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4');
  });

  it('shows the disbursed confirmation when the confirm step submits', async () => {
    const user = userEvent.setup();
    render(<LoanWizard walletAddress="GTEST" />);

    await user.type(screen.getByLabelText('Count'), '2');
    await user.type(screen.getByLabelText('Appraised Value'), '1000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Loan Amount'), '5000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Continue' })); // Review → Confirm

    await user.click(screen.getByRole('button', { name: 'Submit Loan' }));
    expect(await screen.findByText(/Loan Disbursed!/i)).toBeInTheDocument();
    expect(screen.getByText('L1')).toBeInTheDocument();
  });

  it('Cancel resets the wizard back to step 1', async () => {
    const user = userEvent.setup();
    render(<LoanWizard walletAddress="GTEST" />);

    await user.type(screen.getByLabelText('Count'), '2');
    await user.type(screen.getByLabelText('Appraised Value'), '1000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Step 2 of 4/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText(/Step 1 of 4/)).toBeInTheDocument();
    expect(screen.getByText('Collateral step content')).toBeInTheDocument();
  });
});
