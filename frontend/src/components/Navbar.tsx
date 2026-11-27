'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardList,
  Beef,
  Settings,
  Keyboard,
  ArrowLeftRight,
  Menu,
  X,
  User,
  HelpCircle,
  Wallet,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { Icon } from '@/components/Icon';
import ThemeToggle from './ThemeToggle';
import { useWallet } from '@/hooks/useWallet';
import { useOptionalWalletContext } from '@/context/WalletContext';
import { useAtRiskLoans } from '@/hooks/useAtRiskLoans';
import NotificationBadge from '@/components/NotificationBadge';
import { NotificationBell, NotificationDrawer } from '@/components/NotificationDrawer';
import { useNotifications } from '@/hooks/useNotifications';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useShortcutsHelp } from '@/components/KeyboardShortcutsProvider';
// i18n — Issue #1207
import LanguageSwitcher from '@/components/LanguageSwitcher';

const JWT_COOKIE_NAME = 'session';

/** Expires the JWT session cookie on disconnect — Issue #1208. */
function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${JWT_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${JWT_COOKIE_NAME}=; path=/; max-age=0; SameSite=Strict`;
}

const NAV_SECTIONS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/loans', label: 'Loans', icon: ClipboardList },
  { href: '/collateral', label: 'Collateral', icon: Beef },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/** Extra links shown in the mobile drawer (#1498). */
const MOBILE_EXTRA_LINKS = [
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/help/faq', label: 'Help & FAQ', icon: HelpCircle },
] as const;

/**
 * Active-link indicator styles — closes #781
 *
 * Active state:
 *  - Bottom border (3 px, colour-primary token) acting as an underline pill.
 *  - Bold text in the primary token colour.
 *  - Background pill in primary with 10 % opacity — visible on both light/dark.
 *  - `aria-current="page"` for assistive technology.
 *
 * Design token colours satisfy WCAG AA contrast on the nav background
 * in both light mode (#5D3C15 on #FEFCF8 — ~10.8:1) and dark mode
 * (#F0D9B8 on #2A1B0B — ~10.4:1).
 *
 * Icons — #801: lucide-react replaces all emoji. Each icon is decorative
 * (aria-hidden) because the link label is visible text.
 *
 * Notification badge — #803: a red badge on the Dashboard link when any loan
 * has health factor < 1.2.
 *
 * Mobile drawer — #1498: hamburger button opens a full-height slide-in drawer
 * on mobile viewports. The drawer closes on outside click, Escape key, and
 * route change. The toggle button carries aria-expanded and aria-controls.
 */

const MOBILE_DRAWER_ID = 'mobile-nav-drawer';

export default function Navbar() {
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerHeadingRef = useRef<HTMLHeadingElement>(null);
  const notificationBellRef = useRef<HTMLButtonElement>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const walletDropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  // Prefer the shared WalletContext (single source of truth, Issue #1509);
  // fall back to a local useWallet() when rendered outside a WalletProvider.
  const walletCtx = useOptionalWalletContext();
  const localWallet = useWallet();
  const { address, connect, disconnect } = walletCtx ?? localWallet;
  const { atRiskCount } = useAtRiskLoans();
  const shortcutsHelp = useShortcutsHelp();
  const { notifications, unreadCount, markRead, markAllRead, dismiss, dismissAll } =
    useNotifications();

  // Move focus to the drawer heading, keep Tab inside the drawer and restore
  // focus to the hamburger button on close — Issue #1454.
  useDialogFocus({
    isOpen: drawerOpen,
    containerRef: drawerRef,
    headingRef: drawerHeadingRef,
    triggerRef: menuButtonRef,
    onEscape: () => setDrawerOpen(false),
  });

  /**
   * Full auth-clearing disconnect — Issue #1208 / #1509.
   * Clears wallet state, persisted keys and the session cookie, then
   * redirects to the connect screen.
   */
  function handleDisconnect() {
    setWalletDropdownOpen(false);
    if (walletCtx) {
      walletCtx.disconnectAndClear();
      return;
    }
    disconnect();
    clearSessionCookie();
    router.push('/');
  }

  // Close wallet dropdown when clicking outside.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (walletDropdownRef.current && !walletDropdownRef.current.contains(event.target as Node)) {
        setWalletDropdownOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setWalletDropdownOpen(false);
    }

    if (walletDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [walletDropdownOpen]);

  // Close the drawer whenever the route changes — #1498.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Mobile drawer: lock background scroll and close on outside click — #1498.
  // Focus movement, trapping and restoration are handled by useDialogFocus.
  useEffect(() => {
    if (!drawerOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!drawerRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) {
        setDrawerOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [drawerOpen]);

  const truncatedAddress = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : null;

  // Suppress unused-var lint warnings for wallet actions used in future UI.
  void connect;
  void disconnect;
  void truncatedAddress;
  void handleDisconnect;

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="relative border-b px-3 sm:px-4"
        style={{
          backgroundColor: 'var(--color-nav-bg)',
          borderColor: 'var(--color-nav-border)',
        }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 h-14">
          {/* Brand */}
          <Link
            href="/"
            className="font-bold text-base sm:text-lg flex items-center gap-2 min-h-[44px] min-w-0 shrink"
            style={{ color: 'var(--color-text)' }}
          >
            <Icon icon={Beef} size="md" aria-hidden="true" className="text-current shrink-0" />
            <span className="truncate">StellarKraal</span>
          </Link>

          {/* Desktop nav */}
          <ul className="hidden lg:flex items-center gap-1" role="list">
            {NAV_SECTIONS.map(({ href, label, icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              const isDashboard = href === '/dashboard';
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'relative flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg transition font-medium',
                      active ? 'border-b-[3px] font-bold' : 'hover:bg-[color:var(--token-primary)]/5',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={
                      active
                        ? {
                            color: 'var(--token-primary)',
                            borderBottomColor: 'var(--token-primary)',
                            backgroundColor:
                              'color-mix(in srgb, var(--token-primary) 10%, transparent)',
                            borderRadius: '8px 8px 0 0',
                          }
                        : {
                            color: 'var(--token-text-muted)',
                          }
                    }
                  >
                    <Icon icon={icon} size="sm" className="text-current" />
                    {label}
                    {isDashboard && atRiskCount > 0 && <NotificationBadge count={atRiskCount} />}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Right side: shortcuts help + notification bell + theme toggle + hamburger */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {/* Keyboard shortcuts trigger — #531 */}
            <button
              onClick={() => shortcutsHelp?.openShortcutsHelp()}
              aria-label="Show keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              className="hidden sm:flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg transition hover:bg-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)]"
            >
              <Icon icon={Keyboard} size="sm" className="text-[color:var(--color-text-muted)]" />
            </button>

            {/* Language switcher — #1207 (moves into the mobile drawer below sm) */}
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>

            {/* Notification bell — #1066 */}
            <NotificationBell
              buttonRef={notificationBellRef}
              unreadCount={unreadCount}
              onClick={() => setNotifOpen((v) => !v)}
              isOpen={notifOpen}
            />

            {/* Notification drawer — #1066 */}
            <NotificationDrawer
              open={notifOpen}
              onClose={() => setNotifOpen(false)}
              triggerRef={notificationBellRef}
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={markRead}
              onMarkAllRead={markAllRead}
              onDismiss={dismiss}
              onDismissAll={dismissAll}
            />

            {/* Theme toggle — visible on all screen sizes */}
            <ThemeToggle />

            {/* Hamburger toggle — tablet only; phones use the bottom tab bar (#1088) */}
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setDrawerOpen((open) => !open)}
              aria-expanded={drawerOpen}
              aria-controls={MOBILE_DRAWER_ID}
              aria-label={drawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="hidden md:flex lg:hidden items-center justify-center min-h-[44px] min-w-[44px] rounded-lg transition hover:bg-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)]"
              style={{ color: 'var(--color-text)' }}
            >
              <Icon icon={drawerOpen ? X : Menu} size="md" className="text-current" />
            </button>
          </div>
        </div>
      </nav>

      {/*
       * Mobile navigation drawer — #1498
       *
       * Rendered as a sibling of <nav> so it can be fixed/full-height without
       * being clipped by the navbar's layout context.
       *
       * Backdrop: semi-transparent overlay. Clicking it closes the drawer via
       * the mousedown listener above (click target is outside drawerRef).
       *
       * Drawer panel: slides in from the right using a CSS transform transition.
       * No external animation library required.
       *
       * Accessibility:
       *   - role="dialog" + aria-modal="true" signals a modal-like region.
       *   - Escape key and outside-click both close the drawer.
       *   - Active items carry aria-current="page".
       *   - Hamburger aria-expanded reflects open/closed state.
       */}

      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`hidden md:block lg:hidden fixed inset-0 z-40 transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      />

      {/* Drawer panel */}
      <div
        id={MOBILE_DRAWER_ID}
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={[
          'hidden md:flex lg:hidden fixed top-0 right-0 h-[100dvh] w-72 max-w-[85vw] z-50 flex-col',
          'shadow-2xl transition-transform duration-300 ease-in-out',
          drawerOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        style={{
          backgroundColor: 'var(--color-nav-bg)',
          borderLeft: '1px solid var(--color-nav-border)',
        }}
      >
        {/* Drawer header */}
        <div
          className="flex items-center justify-between px-4 h-14 border-b shrink-0"
          style={{ borderColor: 'var(--color-nav-border)' }}
        >
          {/* Screen-reader heading that receives focus when the drawer opens (#1454). */}
          <h2
            ref={drawerHeadingRef}
            id="mobile-nav-drawer-title"
            tabIndex={-1}
            className="sr-only"
          >
            Navigation menu
          </h2>
          <Link
            href="/"
            onClick={() => setDrawerOpen(false)}
            className="font-bold text-base flex items-center gap-2"
            style={{ color: 'var(--color-text)' }}
          >
            <Icon icon={Beef} size="md" aria-hidden="true" className="text-current" />
            <span>StellarKraal</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              menuButtonRef.current?.focus();
            }}
            aria-label="Close navigation menu"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg transition hover:bg-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)]"
            style={{ color: 'var(--color-text)' }}
          >
            <Icon icon={X} size="md" className="text-current" />
          </button>
        </div>

        {/* Nav links */}
        <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto py-2">
          <ul className="flex flex-col px-3" role="list">
            {[...NAV_SECTIONS, ...MOBILE_EXTRA_LINKS].map(({ href, label, icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-3 px-3 min-h-[48px] rounded-lg font-medium transition ${
                      active ? 'font-bold' : 'hover:bg-[color:var(--token-primary)]/5'
                    }`}
                    style={
                      active
                        ? {
                            color: 'var(--token-primary)',
                            backgroundColor:
                              'color-mix(in srgb, var(--token-primary) 10%, transparent)',
                          }
                        : { color: 'var(--token-text-muted)' }
                    }
                  >
                    <Icon icon={icon} size="sm" className="text-current" />
                    {label}
                    {href === '/dashboard' && atRiskCount > 0 && (
                      <NotificationBadge count={atRiskCount} />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Drawer footer — language switcher on small screens */}
        <div
          className="flex items-center justify-between gap-3 border-t px-6 py-3 sm:hidden shrink-0"
          style={{ borderColor: 'var(--color-nav-border)' }}
        >
          <span className="text-sm" style={{ color: 'var(--token-text-muted)' }}>
            Language
          </span>
          <LanguageSwitcher />
        </div>
      </div>
    </>
  );
}
