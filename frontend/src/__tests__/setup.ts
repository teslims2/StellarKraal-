import 'jest-axe/extend-expect';

// jsdom does not implement IntersectionObserver — stub it so components that
// use it (e.g. RepayPanel's sticky-CTA visibility) can render under jsdom.
if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe = () => {};
    unobserve = () => {};
    disconnect = () => {};
    takeRecords = () => [];
  }
  (window as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
  (global as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
}

// jsdom does not implement the Blob-URL half of the File API — stub it so
// components that preview an uploaded image (e.g. CollateralRegistrationForm)
// can create/revoke object URLs under jsdom.
if (typeof URL !== 'undefined') {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:mock-object-url';
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = () => {};
  }
}

// ─── Next.js App Router navigation stubs ────────────────────────────────────
// Many components call useRouter()/usePathname()/useSearchParams() from
// `next/navigation`. In jsdom there is no router mounted, so rendering such a
// component throws "invariant expected app router to be mounted". Provide a
// sensible default mock here so tests that don't opt out can render the
// component tree. Individual tests can still call `jest.mock('next/navigation',
// …)` to override these defaults with scenario-specific behaviour.
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  redirect: jest.fn(),
  notFound: jest.fn(),
  useParams: () => ({}),
}));

// ─── Common jsdom environment gaps ───────────────────────────────────────────
// jsdom does not implement these browser APIs; components and hooks that use
// them (sticky headers, responsive dialogs, print) would otherwise throw.
if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
  if (typeof window.scrollTo !== 'function') {
    window.scrollTo = () => {};
  }
  if (typeof window.print !== 'function') {
    window.print = () => {};
  }
  if (!('ResizeObserver' in window)) {
    class MockResizeObserver {
      observe = () => {};
      unobserve = () => {};
      disconnect = () => {};
    }
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
    (global as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  }
  if (typeof window.alert !== 'function') {
    window.alert = () => {};
  }
  if (typeof window.confirm !== 'function') {
    window.confirm = () => true;
  }
}

