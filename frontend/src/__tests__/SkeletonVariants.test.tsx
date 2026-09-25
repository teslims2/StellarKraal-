/**
 * Tests for the enhanced Skeleton component (#1065).
 *
 * Verifies:
 * - All variants render without crashing
 * - aria-hidden is set (skeletons are decorative)
 * - skeleton-shimmer class is always present
 * - Each variant applies its default dimension classes
 * - Custom className overrides are applied correctly
 */
import React from 'react';
import { render } from '@testing-library/react';
import Skeleton from '../components/Skeleton';

describe('Skeleton — base behaviour', () => {
  it('renders without crashing (default variant)', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it('has aria-hidden="true" to hide from screen readers', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('always includes the skeleton-shimmer CSS class', () => {
    const { container } = render(<Skeleton />);
    expect((container.firstChild as HTMLElement).className).toContain('skeleton-shimmer');
  });

  it('appends custom className to the variant defaults', () => {
    const { container } = render(<Skeleton className="my-custom-class" />);
    expect((container.firstChild as HTMLElement).className).toContain('my-custom-class');
    expect((container.firstChild as HTMLElement).className).toContain('skeleton-shimmer');
  });
});

describe('Skeleton — variants', () => {
  const cases: [string, string][] = [
    ['text',    'h-4'],
    ['heading', 'h-7'],
    ['avatar',  'h-12'],
    ['card',    'h-32'],
    ['button',  'h-10'],
    ['badge',   'rounded-full'],
    ['circle',  'rounded-full'],
  ];

  test.each(cases)('variant=%s renders with expected class (%s)', (variant, expectedClass) => {
    const { container } = render(<Skeleton variant={variant as never} />);
    expect((container.firstChild as HTMLElement).className).toContain(expectedClass);
  });

  it('custom variant renders with no extra preset classes', () => {
    const { container } = render(<Skeleton variant="custom" className="h-6 w-32" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-6');
    expect(el.className).toContain('w-32');
    // No variant-specific class should bleed in
    expect(el.className).not.toContain('h-4');
    expect(el.className).not.toContain('h-7');
  });
});

describe('Skeleton — dark mode compatibility', () => {
  it('uses skeleton-shimmer which reads CSS vars that flip in dark mode', () => {
    const { container } = render(<Skeleton />);
    // We can't test CSS var resolution in jsdom, but we verify the class is
    // present so the theme flip will take effect in a real browser.
    expect((container.firstChild as HTMLElement).className).toContain('skeleton-shimmer');
  });
});
