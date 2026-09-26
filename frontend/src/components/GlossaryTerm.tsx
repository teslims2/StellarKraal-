'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { glossaryTerms } from '@/lib/glossary';

interface GlossaryTermProps {
  termKey: keyof typeof glossaryTerms;
  children?: ReactNode;
}

export function GlossaryTerm({ termKey, children }: GlossaryTermProps) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);
  const termData = glossaryTerms[termKey];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  if (!termData) return <>{children}</>;

  const { term, definition } = termData;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsVisible(false);
    }
  };

  return (
    <span ref={containerRef} className="relative inline-flex max-w-full items-center">
      <button
        type="button"
        aria-expanded={isVisible}
        aria-controls={tooltipId}
        aria-describedby={isVisible ? tooltipId : undefined}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        onClick={() => setIsVisible(true)}
        onKeyDown={handleKeyDown}
        className="inline-flex min-w-0 items-center gap-1 rounded-md text-left underline decoration-gold/60 underline-offset-2 transition hover:text-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 dark:text-cream-100 dark:hover:text-gold-300"
      >
        <span className="min-w-0 break-words">{children || term}</span>
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-gold-700 dark:text-gold-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-brown-900 p-3 text-left text-sm text-cream-50 shadow-lg dark:bg-cream-50 dark:text-brown-900 sm:left-1/2 sm:-translate-x-1/2"
        >
          <div className="mb-1 font-semibold">{term}</div>
          <div>{definition}</div>
          <span
            aria-hidden="true"
            className="absolute -bottom-2 left-4 border-x-8 border-t-[0.5rem] border-x-transparent border-t-brown-900 dark:border-t-cream-50 sm:left-1/2 sm:-translate-x-1/2"
          />
        </div>
      )}
    </span>
  );
}
