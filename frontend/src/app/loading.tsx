/**
 * Root-level loading UI — shown during initial load and lazy-loaded route transitions.
 * Closes #1514.
 *
 * Next.js streams this component while the page below is being prepared.
 * Keeping it a simple server component avoids hydration overhead.
 */
export default function RootLoading() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="flex min-h-[60vh] flex-col items-center justify-center"
    >
      <svg
        className="sk-loading-logo"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ width: 64, height: 64 }}
      >
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .sk-loading-logo {
                animation: sk-pulse 1.6s cubic-bezier(0.4,0,0.6,1) infinite;
              }
              @keyframes sk-pulse {
                0%, 100% { opacity: 0.75; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.07); }
              }
              @media (prefers-reduced-motion: reduce) {
                .sk-loading-logo { animation: none !important; }
              }
            `,
          }}
        />
        <ellipse
          cx="40"
          cy="48"
          rx="20"
          ry="12"
          fill="var(--token-surface, #ffffff)"
          stroke="var(--token-primary, #5d3c15)"
          strokeWidth="2.5"
        />
        <ellipse
          cx="40"
          cy="28"
          rx="10"
          ry="8"
          fill="var(--token-surface, #ffffff)"
          stroke="var(--token-primary, #5d3c15)"
          strokeWidth="2.5"
        />
        <path
          d="M30 25 Q26 18 29 16 Q32 20 30 25Z"
          fill="var(--token-primary, #5d3c15)"
          opacity="0.7"
        />
        <path
          d="M50 25 Q54 18 51 16 Q48 20 50 25Z"
          fill="var(--token-primary, #5d3c15)"
          opacity="0.7"
        />
        <circle cx="36" cy="27" r="1.5" fill="var(--token-primary, #5d3c15)" />
        <circle cx="44" cy="27" r="1.5" fill="var(--token-primary, #5d3c15)" />
        <circle cx="26" cy="18" r="3" fill="var(--token-accent, #d4a017)" />
      </svg>

      <p
        className="mt-3 text-sm font-semibold tracking-widest"
        style={{ color: 'var(--token-primary, #5d3c15)' }}
      >
        Loading…
      </p>
    </div>
  );
}
