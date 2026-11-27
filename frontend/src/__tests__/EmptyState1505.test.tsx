import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import EmptyState from '../components/EmptyState';

describe('EmptyState — issue #1505', () => {
  it('accepts title, description and a named illustration', () => {
    render(
      <EmptyState
        illustration="loans"
        title="No Loans Yet"
        description="Request your first loan to get started."
      />
    );

    expect(screen.getByRole('heading', { name: 'No Loans Yet' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Request your first loan to get started.');

    const illustration = screen.getByRole('img');
    expect(illustration.getAttribute('aria-label')).toBe('No loans yet');
    expect(illustration.getAttribute('aria-hidden')).toBeNull();
  });

  it('renders an optional CTA button and invokes its handler', () => {
    const onCta = jest.fn();
    render(
      <EmptyState
        illustration="collateral"
        title="No Collateral Registered"
        description="Register livestock to unlock loans."
        ctaLabel="Register Collateral"
        onCta={onCta}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Register Collateral' }));
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it('supports link CTAs and keeps both accessible CTA wordings', () => {
    render(
      <EmptyState
        illustration="loans"
        title="No Loans Yet"
        description="Start with your first loan."
        ctaLabel="Request Your First Loan"
        ctaAlias="Request a Loan"
        ctaHref="/borrow"
      />
    );

    const cta = screen.getByRole('link');
    expect(cta.getAttribute('href')).toBe('/borrow');
    expect(cta.textContent).toContain('Request Your First Loan');
    expect(cta.textContent).toContain('Request a Loan');
  });

  it('uses design tokens so it renders correctly in light and dark mode', () => {
    const { container } = render(
      <EmptyState
        illustration="collateral"
        title="No Collateral Registered"
        description="Register livestock to unlock loans."
        ctaLabel="Register Collateral"
        onCta={() => {}}
      />
    );

    expect(container.innerHTML).toMatch(/--token-surface/);
    expect(container.innerHTML).toMatch(/--token-text/);
    expect(container.innerHTML).toMatch(/var\(--token-/);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <EmptyState
        illustration="transactions"
        title="No Transactions Yet"
        description="Your transactions will appear here."
        ctaLabel="View Loans"
        onCta={() => {}}
      />
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
