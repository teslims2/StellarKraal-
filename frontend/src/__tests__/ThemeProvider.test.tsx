import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeProvider, { ThemeScript, useTheme } from '../components/ThemeProvider';

function mockMatchMedia(matchesDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: matchesDark,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });
}

/** Runs the real ThemeScript source against the current jsdom document,
 * the same way the browser would execute it before React hydrates. */
function runThemeScript() {
  const { container } = render(<ThemeScript />);
  const script = container.querySelector('script')!.innerHTML;
  eval(script);
}

describe('ThemeProvider (#572 – hydration)', () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  it('renders children without crashing', () => {
    render(
      <ThemeProvider>
        <span>content</span>
      </ThemeProvider>
    );
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('ThemeScript renders a <script> that manipulates classList, not textContent', () => {
    const { container } = render(<ThemeScript />);
    const script = container.querySelector('script');
    expect(script).not.toBeNull();
    expect(script!.innerHTML).toContain('classList');
    expect(script!.innerHTML).not.toContain('textContent');
  });
});

// #528 / #1424: dark mode toggle persistence and system preference fallback
describe('ThemeScript (#528 / #1424 – read-from-storage & system-preference fallback)', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  it('applies dark class from a stored "dark" preference, regardless of system preference', () => {
    localStorage.setItem('theme', 'dark');
    mockMatchMedia(false); // system prefers light — stored value should win
    runThemeScript();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('keeps light (no dark class) from a stored "light" preference, even if system prefers dark', () => {
    localStorage.setItem('theme', 'light');
    mockMatchMedia(true); // system prefers dark — stored value should still win
    runThemeScript();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('falls back to system preference (dark) when stored as "system"', () => {
    localStorage.setItem('theme', 'system');
    mockMatchMedia(true);
    runThemeScript();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('falls back to system preference (light) when stored as "system"', () => {
    localStorage.setItem('theme', 'system');
    mockMatchMedia(false);
    runThemeScript();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('falls back to system preference (dark) when nothing is stored', () => {
    mockMatchMedia(true);
    runThemeScript();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('falls back to system preference (light) when nothing is stored', () => {
    mockMatchMedia(false);
    runThemeScript();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('ThemeProvider (#528 / #1424 – reads the class already applied by ThemeScript)', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  function ThemeLabel() {
    const { theme, mode } = useTheme();
    return <span>{`${theme}:${mode}`}</span>;
  }

  it('picks up "dark" when ThemeScript has already applied the class before hydration', () => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
    render(
      <ThemeProvider>
        <ThemeLabel />
      </ThemeProvider>
    );
    expect(screen.getByText('dark:dark')).toBeTruthy();
  });

  it('picks up "light" when no class was applied', () => {
    localStorage.setItem('theme', 'light');
    render(
      <ThemeProvider>
        <ThemeLabel />
      </ThemeProvider>
    );
    expect(screen.getByText('light:light')).toBeTruthy();
  });

  it('writes the toggled preference to localStorage and cycles light→dark→system', () => {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');

    function ToggleButton() {
      const { toggle, mode } = useTheme();
      return <button onClick={toggle}>{mode}</button>;
    }
    render(
      <ThemeProvider>
        <ToggleButton />
      </ThemeProvider>
    );

    // light → dark
    fireEvent.click(screen.getByText('light'));
    expect(localStorage.getItem('theme')).toBe('dark');

    // dark → system
    fireEvent.click(screen.getByText('dark'));
    expect(localStorage.getItem('theme')).toBe('system');

    // system → light
    fireEvent.click(screen.getByText('system'));
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('setMode("dark") applies dark class and persists the choice', () => {
    function SetDarkButton() {
      const { setMode } = useTheme();
      return <button onClick={() => setMode('dark')}>set dark</button>;
    }
    render(
      <ThemeProvider>
        <SetDarkButton />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText('set dark'));
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
