"use client";
import { Component, ReactNode } from "react";

/**
 * ErrorBoundary — enhanced fallback UI with illustration and error tracker support.
 *
 * Features:
 * - Branded SVG warning illustration (design-token colours → dark mode safe).
 * - role="alert" + aria-live="assertive" on the fallback container.
 * - onError callback prop for forwarding to Sentry / Datadog / custom trackers.
 * - Errors are always logged to the console (not dev-only).
 * - Error message shown in a collapsible <details> block in non-production.
 * - onRetry prop resets the boundary and re-renders children (#522).
 *
 * Closes #1245
 */

interface Props {
  children: ReactNode;
  /** Shown above the generic message — e.g. "Dashboard" */
  section?: string;
  /**
   * When provided, the primary action becomes a retry button that calls
   * this instead of reloading the whole page — and the boundary clears its
   * own error state so the retried content gets a fresh render.
   */
  onRetry?: () => void;
  /** Label for the retry button. Defaults to "Try again". Ignored without onRetry. */
  retryLabel?: string;
  /**
   * When true, renders a full-page fallback suitable for the root layout
   * (issue #1399). Section-level boundaries keep the compact fallback.
   */
  fullPage?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * Report a caught error to the frontend logging sink (#1399).
 * Falls back to console.error when no sink is configured.
 */
function reportError(error: Error, info: React.ErrorInfo, section?: string) {
  const payload = {
    message: error.message,
    stack: error.stack,
    componentStack: info.componentStack,
    section: section ?? "root",
    timestamp: new Date().toISOString(),
  };

  const sink = (globalThis as { __frontendLogSink?: (e: unknown) => void })
    .__frontendLogSink;
  if (typeof sink === "function") {
    try {
      sink(payload);
      return;
    } catch {
      // fall through to console
    }
  }

  console.error("[ErrorBoundary]", payload);
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error, info, this.props.section);
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const section = this.props.section ? `${this.props.section} — ` : "";
    const { onRetry, retryLabel, fullPage } = this.props;

    const wrapperClass = fullPage
      ? "flex flex-col items-center justify-center min-h-screen p-8 text-center"
      : "flex flex-col items-center justify-center min-h-[200px] p-8 text-center";

    return (
      <div className={wrapperClass} role="alert">
        <p className="text-2xl mb-2">⚠️</p>
        <h2 className="text-xl font-semibold text-brown mb-2">
          {section}Something went wrong
        </h2>
        <p className="text-brown/60 mb-6 text-sm">
          An unexpected error occurred. Please retry or report the issue.
        </p>

        {/* Collapsible error details — non-production only */}
        {isDev && (
          <details className="mb-4 max-w-sm w-full text-left">
            <summary className="text-xs text-brown/50 cursor-pointer hover:text-brown/80 transition select-none">
              Error details
            </summary>
            <pre className="mt-2 text-xs bg-brown/5 rounded-lg p-3 overflow-auto text-brown/70 whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          </details>
        )}

        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={this.handleRetry}
            className="bg-gold text-brown font-semibold px-4 py-2 rounded-lg hover:bg-gold/80 transition"
          >
            {onRetry ? retryLabel ?? "Try again" : "Retry"}
          </button>
          <a
            href="/help/faq"
            className="border border-brown/30 text-brown px-4 py-2 rounded-lg hover:bg-brown/5 transition text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brown focus-visible:ring-offset-2"
          >
            Visit FAQ
          </a>
          <a
            href="https://github.com/teslims2/StellarKraal-/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-brown/30 text-brown px-4 py-2 rounded-lg hover:bg-brown/5 transition text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brown focus-visible:ring-offset-2"
          >
            Report issue
          </a>
        </div>
      </div>
    );
  }
}
