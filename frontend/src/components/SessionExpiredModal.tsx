'use client';
/**
 * SessionExpiredModal — Issue #1509
 *
 * Shown when the session JWT expires or the wallet is disconnected outside the
 * app (Freighter locked, access revoked, account switched). Instead of
 * redirecting away, the modal is rendered on top of the current page so the
 * user keeps their context and in-progress form/wizard state:
 *
 *  - "Reconnect wallet" re-requests Freighter access and renews the session in
 *    place; on success the modal closes and the user continues where they were.
 *  - "Disconnect" clears session state and returns to the connect screen.
 *
 * The modal can't be dismissed without choosing one of those actions, because
 * any further action on the page would fail without a valid session.
 */
import { useId } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useOptionalWalletContext } from '@/context/WalletContext';

export default function SessionExpiredModal() {
  const wallet = useOptionalWalletContext();
  const titleId = useId();

  if (!wallet || !wallet.needsReconnect) return null;

  const { sessionExpired, reconnect, reconnecting, reconnectError, disconnectAndClear } = wallet;

  const title = sessionExpired ? 'Your session has expired' : 'Wallet disconnected';
  const message = sessionExpired
    ? 'For your security, your session timed out. Reconnect your wallet to pick up where you left off — your current page and any unsaved progress will be kept.'
    : 'We lost the connection to your Freighter wallet (it may have been locked, disconnected, or switched to a different account). Reconnect to continue — your current page and any unsaved progress will be kept.';

  return (
    <Modal
      open
      // Closing without a decision would leave the user on a page that can't
      // talk to the backend, so the close affordances are intentionally inert.
      onClose={() => {}}
      title={title}
      titleId={titleId}
      role="alertdialog"
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={disconnectAndClear}
            disabled={reconnecting}
            data-testid="session-expired-disconnect"
          >
            Disconnect
          </Button>
          <Button
            onClick={() => void reconnect()}
            disabled={reconnecting}
            data-testid="session-expired-reconnect"
          >
            {reconnecting ? 'Reconnecting…' : 'Reconnect wallet'}
          </Button>
        </>
      }
    >
      <div data-testid="session-expired-modal">
        <p className="text-sm text-brown-700 dark:text-cream-100">{message}</p>
        {reconnectError && (
          <p
            role="alert"
            className="mt-3 text-sm"
            style={{ color: 'var(--token-danger, #DC2626)' }}
            data-testid="session-expired-error"
          >
            {reconnectError}
          </p>
        )}
      </div>
    </Modal>
  );
}
