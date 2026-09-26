import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import StepReview from '@/components/wizard/steps/StepReview';
import { glossaryTerms } from '@/lib/glossary';

expect.extend(toHaveNoViolations);

const mockUseWizard = jest.fn();
const mockNextStep = jest.fn();
const mockPrevStep = jest.fn();

jest.mock('@/context/LoanWizardContext', () => ({
  useWizard: () => mockUseWizard(),
}));

jest.mock('@/hooks/useCurrencyConversion', () => ({
  useCurrencyConversion: () => ({
    rates: { USD: 1 },
    convert: jest.fn(),
  }),
}));

const defaultState = {
  animalType: 'cattle' as const,
  count: '2',
  appraisedValue: '20000000',
  collateralId: 'col-001',
  collaterals: [],
  loanAmount: '10000000',
  loanTermDays: '30',
  step: 3,
  loading: false,
  error: null,
  nextStep: mockNextStep,
  prevStep: mockPrevStep,
};

describe('StepReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWizard.mockReturnValue(defaultState);
  });

  it('shows the simplified summary with reading time and complexity', () => {
    render(<StepReview />);

    expect(screen.getByRole('heading', { name: 'Review Loan Terms' })).toBeInTheDocument();
    expect(screen.getByText('About 1 minute read')).toBeInTheDocument();
    expect(screen.getByText('Low complexity')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Loan Summary' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText(/You are borrowing/)).toBeInTheDocument();
  });

  it('reveals detailed terms behind Show full terms', () => {
    render(<StepReview />);

    const toggle = screen.getByRole('button', { name: 'Show full terms' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'loan-terms-content');

    fireEvent.click(toggle);

    expect(screen.getByRole('region', { name: 'Full Loan Terms' })).toBeInTheDocument();
    expect(screen.getByText('About 2 minute read')).toBeInTheDocument();
    expect(screen.getByText('High complexity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show simplified view' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('returns to the simplified view without duplicating the panel', () => {
    render(<StepReview />);

    fireEvent.click(screen.getByRole('button', { name: 'Show full terms' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show simplified view' }));

    expect(screen.getByRole('region', { name: 'Loan Summary' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Full Loan Terms' })).not.toBeInTheDocument();
  });

  it('shows a GlossaryTerm tooltip on hover and connects it to the term', () => {
    render(<StepReview />);
    fireEvent.click(screen.getByRole('button', { name: 'Show full terms' }));

    const term = screen.getByRole('button', { name: 'Loan Amount' });
    fireEvent.mouseEnter(term);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent(glossaryTerms.loanAmount.term);
    expect(tooltip).toHaveTextContent(glossaryTerms.loanAmount.definition);
    expect(term).toHaveAttribute('aria-describedby', tooltip.id);
    expect(term).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows GlossaryTerm tooltips on keyboard focus and closes on Escape', () => {
    render(<StepReview />);
    fireEvent.click(screen.getByRole('button', { name: 'Show full terms' }));

    const term = screen.getByRole('button', { name: 'Health Factor' });
    fireEvent.focus(term);

    expect(screen.getByRole('tooltip')).toHaveTextContent(glossaryTerms.healthFactor.definition);

    fireEvent.keyDown(term, { key: 'Escape' });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(term).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders valid glossary definitions for all highlighted terms', () => {
    render(<StepReview />);
    fireEvent.click(screen.getByRole('button', { name: 'Show full terms' }));

    [
      'Collateral Type',
      'Appraised Value',
      'Loan Amount',
      'Fee Rate',
      'Fee Amount',
      'Total to Repay',
      'Health Factor',
    ].forEach((name) => {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    });

    expect(glossaryTerms.loanAmount.definition).toBeTruthy();
    expect(glossaryTerms.feeRate.definition).toBeTruthy();
  });

  it('shows amount breakdown values on click', () => {
    render(<StepReview />);

    const infoButton = screen.getByRole('button', { name: 'Amount breakdown' });
    fireEvent.click(infoButton);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Principal');
    expect(tooltip).toHaveTextContent('Origination Fee');
    expect(tooltip).toHaveTextContent('Est. First Interest');
    expect(tooltip).toHaveTextContent('1.00 XLM');
    expect(tooltip).toHaveTextContent('0.05 XLM');
    expect(tooltip).toHaveTextContent('0.01 XLM');
  });

  it.each(['Enter', ' '])('toggles the amount breakdown with %s', (key) => {
    render(<StepReview />);
    const infoButton = screen.getByRole('button', { name: 'Amount breakdown' });

    fireEvent.keyDown(infoButton, { key });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('closes the amount breakdown on Escape', () => {
    render(<StepReview />);
    const infoButton = screen.getByRole('button', { name: 'Amount breakdown' });

    fireEvent.click(infoButton);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(infoButton, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('uses mobile-first layouts for both views', () => {
    render(<StepReview />);

    const summary = screen.getByRole('region', { name: 'Loan Summary' });
    expect(summary.querySelector('ul')).toHaveClass('list-disc', 'pl-5');

    fireEvent.click(screen.getByRole('button', { name: 'Show full terms' }));
    const detailedTerms = screen.getByRole('region', { name: 'Full Loan Terms' });
    const firstRow = detailedTerms.querySelector('dl > div');

    expect(firstRow).toHaveClass('grid-cols-1', 'sm:grid-cols-[minmax(0,1fr)_auto]');
    expect(detailedTerms.querySelector('dt')).toHaveClass('break-words');
    expect(detailedTerms.querySelector('dd')).toHaveClass('break-words');
  });

  it('navigates to previous and next steps', () => {
    render(<StepReview />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and submit' }));

    expect(mockPrevStep).toHaveBeenCalledTimes(1);
    expect(mockNextStep).toHaveBeenCalledTimes(1);
  });

  it('has no detectable accessibility violations in either view', async () => {
    const { container } = render(<StepReview />);

    expect(await axe(container)).toHaveNoViolations();

    fireEvent.click(screen.getByRole('button', { name: 'Show full terms' }));

    expect(await axe(container)).toHaveNoViolations();
  });
});
