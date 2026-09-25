import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import Navbar from '../components/Navbar';

expect.extend(toHaveNoViolations);

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

// Mock next/link
jest.mock('next/link', () => {
  const Link = ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
  Link.displayName = 'Link';
  return Link;
});

describe('Navbar', () => {
  it('renders all four navigation sections with icons and labels', () => {
    render(<Navbar />);
    expect(screen.getAllByRole('link', { name: /dashboard/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /loans/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /collateral/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /settings/i }).length).toBeGreaterThan(0);
  });

  // #781: aria-current="page" is set on the active link
  it('marks the active page with aria-current=page', () => {
    render(<Navbar />);
    const activeLinks = screen.getAllByRole('link', { name: /dashboard/i });
    const desktopActive = activeLinks.find((l) => l.getAttribute('aria-current') === 'page');
    expect(desktopActive).toBeTruthy();
  });

  // #781: inactive links do NOT have aria-current
  it('inactive links do not have aria-current', () => {
    render(<Navbar />);
    const loansLinks = screen.getAllByRole('link', { name: /loans/i });
    const hasAriaCurrent = loansLinks.some((l) => l.getAttribute('aria-current') === 'page');
    expect(hasAriaCurrent).toBe(false);
  });

  // #781: active link uses design token colour (inline style with CSS var)
  it('active link uses a design token colour via inline style', () => {
    render(<Navbar />);
    const activeLinks = screen.getAllByRole('link', { name: /dashboard/i });
    const activeLink = activeLinks.find((l) => l.getAttribute('aria-current') === 'page');
    expect(activeLink).toBeTruthy();
    // The style should reference CSS custom properties (design tokens)
    const style = activeLink!.getAttribute('style') || '';
    expect(style).toMatch(/var\(--token-primary\)/);
  });

  // #781: active indicator — bottom border is set as a CSS rule
  it('active link has border-bottom styling as active indicator', () => {
    render(<Navbar />);
    const activeLinks = screen.getAllByRole('link', { name: /dashboard/i });
    const activeLink = activeLinks.find((l) => l.getAttribute('aria-current') === 'page');
    expect(activeLink).toBeTruthy();
    const classes = activeLink!.className;
    expect(classes).toMatch(/border-b/);
  });

  // Task scenario 1: user wants to view their loans from any page
  it('scenario: user can reach Loans within 1 click from any page', () => {
    render(<Navbar />);
    const loansLink = screen.getAllByRole('link', { name: /loans/i })[0];
    expect(loansLink).toHaveAttribute('href', '/loans');
  });

  // Task scenario 2: user wants to register collateral
  it('scenario: user can reach Collateral within 1 click from any page', () => {
    render(<Navbar />);
    const collateralLink = screen.getAllByRole('link', { name: /collateral/i })[0];
    expect(collateralLink).toHaveAttribute('href', '/collateral');
  });

  // Task scenario 3: user wants to change settings
  it('scenario: user can reach Settings within 1 click from any page', () => {
    render(<Navbar />);
    const settingsLink = screen.getAllByRole('link', { name: /settings/i })[0];
    expect(settingsLink).toHaveAttribute('href', '/settings');
  });

  it('does not render a hamburger menu; mobile uses the bottom tab bar', () => {
    render(<Navbar />);
    expect(screen.queryByRole('button', { name: /open menu/i })).toBeNull();
    expect(document.getElementById('mobile-menu')).toBeNull();
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<Navbar />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

});
