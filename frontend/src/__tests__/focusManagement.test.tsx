/**
 * Tests for #1454 — focus management in dialogs and across route changes.
 */
import React, { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useDialogFocus } from '@/hooks/useDialogFocus';

function FocusManagedDialog() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useDialogFocus({
    isOpen: open,
    containerRef: dialogRef,
    headingRef,
    triggerRef,
    onEscape: () => setOpen(false),
  });

  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <button data-testid="outside">Outside</button>
      {open && (
        <div ref={dialogRef} role="dialog" aria-modal="true">
          <h2 ref={headingRef} tabIndex={-1}>
            Dialog heading
          </h2>
          <button data-testid="first">First</button>
          <button data-testid="last" onClick={() => setOpen(false)}>
            Last / close
          </button>
        </div>
      )}
    </>
  );
}

describe('useDialogFocus (#1454)', () => {
  it('moves focus to the heading when the dialog opens', () => {
    render(<FocusManagedDialog />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('heading', { name: 'Dialog heading' })).toHaveFocus();
  });

  it('traps Tab and Shift+Tab inside the dialog', () => {
    render(<FocusManagedDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    const first = screen.getByTestId('first');
    const last = screen.getByTestId('last');

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('pulls focus back into the dialog when it is outside', () => {
    render(<FocusManagedDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    const outside = screen.getByTestId('outside');
    outside.focus();
    fireEvent.keyDown(outside, { key: 'Tab' });
    expect(screen.getByTestId('first')).toHaveFocus();
  });

  it('restores focus to the triggering element on close', () => {
    render(<FocusManagedDialog />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByTestId('last'));
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape and restores focus', () => {
    render(<FocusManagedDialog />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

// ── Route transitions ────────────────────────────────────────────────────────

let mockPathname = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

// Imported after the mock so usePathname resolves to the mocked implementation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RouteFocusManager = require('@/components/RouteFocusManager').default as React.ComponentType;

describe('RouteFocusManager (#1454)', () => {
  beforeEach(() => {
    mockPathname = '/';
  });

  function renderShell() {
    return render(
      <>
        <RouteFocusManager />
        <main id="main-content">
          <h1 data-testid="page-heading">Page title</h1>
          <p>Content</p>
        </main>
      </>
    );
  }

  it('moves focus to the new page heading on a route transition', () => {
    const { rerender } = renderShell();
    const heading = screen.getByTestId('page-heading');
    expect(heading).toHaveAttribute('tabindex', '-1');

    mockPathname = '/loans';
    rerender(
      <>
        <RouteFocusManager />
        <main id="main-content">
          <h1 data-testid="page-heading">Loans</h1>
        </main>
      </>
    );

    expect(screen.getByTestId('page-heading')).toHaveFocus();
  });

  it('falls back to the main content area when there is no heading', () => {
    const { rerender } = renderShell();
    mockPathname = '/settings';
    rerender(
      <>
        <RouteFocusManager />
        <main id="main-content" data-testid="main">
          <p>Settings</p>
        </main>
      </>
    );

    expect(screen.getByTestId('main')).toHaveFocus();
  });

  it('does not steal focus from an open dialog', () => {
    const { rerender } = renderShell();
    mockPathname = '/dashboard';
    rerender(
      <>
        <RouteFocusManager />
        <div role="dialog" aria-modal="true">
          <button data-testid="dialog-button">Dialog</button>
        </div>
        <main id="main-content">
          <h1>Dashboard</h1>
        </main>
      </>
    );

    expect(screen.getByTestId('dialog-button')).not.toHaveFocus();
  });
});
