"use client";
import { useRef } from "react";
import { Shortcut } from "@/hooks/useKeyboardShortcuts";
import { useDialogFocus } from "@/hooks/useDialogFocus";

interface Props {
  shortcuts: Shortcut[];
  onClose: () => void;
}

export default function ShortcutsHelpModal({ shortcuts, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = "shortcuts-help-title";

  // Focus the heading on open, trap Tab inside the dialog and return focus to
  // the element that opened it on close — Issue #1454.
  useDialogFocus({
    isOpen: true,
    containerRef: dialogRef,
    headingRef,
    onEscape: onClose,
  });

  return (
    <>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-brown">
              Keyboard Shortcuts
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-brown/50 hover:text-brown text-xl leading-none"
            >
              ×
            </button>
          </div>
          <ul className="space-y-2">
            {shortcuts.map((s) => (
              <li key={s.key} className="flex justify-between text-sm">
                <span className="text-brown/80">{s.label}</span>
                <kbd className="bg-brown/10 text-brown font-mono px-2 py-0.5 rounded text-xs">
                  {s.hint}
                </kbd>
              </li>
            ))}
          </ul>
          <p className="text-xs text-brown/40 mt-4">Press <kbd className="font-mono">?</kbd> to toggle this panel</p>
        </div>
      </div>
    </>
  );
}
