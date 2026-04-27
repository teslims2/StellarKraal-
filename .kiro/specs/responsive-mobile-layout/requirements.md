# Requirements Document

## Introduction

StellarKraal is a livestock-backed micro-lending platform targeting African emerging markets, where the majority of users access the web on mobile devices with small screens (320–414px wide). The application currently renders only a desktop layout, causing horizontal overflow, unreadable text, and inaccessible touch targets on mobile. This feature adds a fully responsive mobile layout across all pages and components using Tailwind CSS utility classes, with no new dependencies. It also introduces a Navbar component (currently absent) and fixes a TypeScript-in-.js file that causes compile errors.

## Glossary

- **App**: The StellarKraal Next.js frontend application located at `frontend/`.
- **Navbar**: The top-level navigation component rendered on every page, providing links to Home, Dashboard, and Borrow.
- **Hamburger_Menu**: A button visible only on mobile viewports that toggles the mobile navigation drawer.
- **Mobile_Viewport**: A screen width below 768px (Tailwind `md` breakpoint).
- **Desktop_Viewport**: A screen width of 768px or above.
- **Touch_Target**: An interactive element (button, link, input) that must be at least 44×44 CSS pixels to be reliably tappable on touchscreens.
- **Layout**: The root `layout.tsx` file that wraps all pages.
- **Home_Page**: The page rendered at the `/` route (`src/app/page.tsx`).
- **Dashboard_Page**: The page rendered at the `/dashboard` route (`src/app/dashboard/page.tsx`).
- **Borrow_Page**: The page rendered at the `/borrow` route (`src/app/borrow/page.tsx`).
- **LoanForm**: The `src/components/LoanForm.tsx` component for registering collateral and requesting a loan.
- **CollateralCard**: The `src/components/CollateralCard.tsx` component for looking up a loan by ID.
- **RepayPanel**: The `src/components/RepayPanel.tsx` component for submitting a loan repayment.
- **WalletConnect**: The `src/components/WalletConnect.tsx` component for connecting a Freighter wallet.
- **HealthGauge**: The `src/components/HealthGauge.tsx` component that renders a health-factor progress bar.
- **LoanRepaymentCalculator**: The `src/components/LoanRepaymentCalculator.tsx` component for previewing repayment breakdowns.
- **StellarUtils**: The `src/lib/stellarUtils.js` utility module containing TypeScript syntax.
- **Tailwind**: The Tailwind CSS framework already configured in the project with custom colors `brown`, `gold`, and `cream`.

---

## Requirements

### Requirement 1: Responsive Navbar Component

**User Story:** As a mobile user, I want a navigation bar that is easy to use on a small screen, so that I can move between pages without horizontal scrolling or accidentally tapping the wrong link.

#### Acceptance Criteria

1. THE App SHALL render the Navbar at the top of every page by including it in the Layout above `{children}`.
2. WHILE the viewport is a Desktop_Viewport, THE Navbar SHALL display the logo and navigation links (Home, Dashboard, Borrow) in a single horizontal row using `hidden md:flex` patterns.
3. WHILE the viewport is a Mobile_Viewport, THE Navbar SHALL hide the horizontal link row and display a Hamburger_Menu button using `md:hidden`.
4. WHEN the user taps the Hamburger_Menu button, THE Navbar SHALL toggle a vertical navigation drawer that lists all navigation links.
5. WHEN the navigation drawer is open and the user taps a navigation link, THE Navbar SHALL close the drawer and navigate to the selected page.
6. THE Navbar SHALL implement each navigation link and the Hamburger_Menu button as a Touch_Target with a minimum height of 44px and minimum width of 44px (`min-h-[44px] min-w-[44px]`).
7. THE Navbar SHALL use only the existing Tailwind color tokens `brown`, `gold`, and `cream` — no new colors or CSS files.

### Requirement 2: Layout Mobile Baseline

**User Story:** As a mobile user, I want the page body to have safe horizontal padding and no horizontal scroll bar, so that content is never clipped or hidden off-screen.

#### Acceptance Criteria

1. THE Layout SHALL apply `overflow-x-hidden` to the `<body>` element to prevent horizontal scrolling caused by any child element wider than the viewport.
2. THE Layout SHALL apply `px-4` to the `<body>` element to provide a minimum 16px horizontal gutter on all pages at all viewport widths.
3. THE Layout SHALL include the Navbar component above `{children}` so it appears on every page.

### Requirement 3: Responsive Home Page

**User Story:** As a mobile user visiting the home page, I want the hero content and call-to-action buttons to be readable and tappable on a 375px screen, so that I can understand the product and navigate to the loan flow.

#### Acceptance Criteria

1. THE Home_Page SHALL render the hero heading at a font size that is legible on a 375px viewport (no larger than `text-4xl` on mobile, scaling up to `text-5xl` on Desktop_Viewport using `md:text-5xl`).
2. THE Home_Page SHALL stack the call-to-action buttons vertically on a Mobile_Viewport and display them side-by-side on a Desktop_Viewport using `flex-col md:flex-row`.
3. THE Home_Page SHALL render each call-to-action button as a Touch_Target with `min-h-[44px]`.
4. THE Home_Page SHALL constrain the descriptive paragraph to a maximum width of `max-w-sm` on mobile so line lengths remain readable.

### Requirement 4: Responsive Dashboard Page

**User Story:** As a mobile user on the dashboard, I want loan data and health metrics to be readable without horizontal scrolling, so that I can monitor and manage my loans on a small screen.

#### Acceptance Criteria

1. THE Dashboard_Page SHALL stack all dashboard sections (CollateralCard, LoanRepaymentCalculator, RepayPanel, Health Factor) vertically in a single column on a Mobile_Viewport.
2. WHEN the Health Factor section is displayed on a Mobile_Viewport, THE Dashboard_Page SHALL render the loan-ID input and Check button stacked vertically (`flex-col`) so neither element is narrower than the viewport minus padding.
3. THE Dashboard_Page SHALL ensure the Health Factor input and Check button are each a Touch_Target with `min-h-[44px]`.

### Requirement 5: Responsive Borrow Page

**User Story:** As a mobile user on the borrow page, I want all form inputs to span the full available width, so that I can type comfortably on a touchscreen keyboard.

#### Acceptance Criteria

1. THE Borrow_Page SHALL apply `w-full` to its container so child components fill the available width on all viewport sizes.
2. THE Borrow_Page SHALL constrain its maximum width to `max-w-lg` on Desktop_Viewport while remaining full-width on Mobile_Viewport.

### Requirement 6: Responsive LoanForm Component

**User Story:** As a mobile user registering collateral or requesting a loan, I want all form fields and buttons to be full-width and easy to tap, so that I can complete the form without zooming or mis-tapping.

#### Acceptance Criteria

1. THE LoanForm SHALL render all `<input>` and `<select>` elements with `w-full` and `min-h-[44px]` so they span the full container width and meet the Touch_Target height requirement.
2. THE LoanForm SHALL render all submit buttons with `w-full` and `min-h-[44px]`.
3. THE LoanForm SHALL stack all form fields vertically with consistent vertical spacing (`space-y-4`) on all viewport sizes.
4. THE LoanForm SHALL place labels above their corresponding inputs (block label before input) so the layout does not break on narrow viewports.

### Requirement 7: Responsive CollateralCard Component

**User Story:** As a mobile user looking up a loan, I want the lookup input and button to be full-width and easy to tap, so that I can enter a loan ID without the layout overflowing.

#### Acceptance Criteria

1. THE CollateralCard SHALL render the loan-ID input and Fetch button stacked vertically (`flex-col`) on a Mobile_Viewport and side-by-side (`md:flex-row`) on a Desktop_Viewport.
2. THE CollateralCard SHALL render the Fetch button as a Touch_Target with `min-h-[44px] w-full md:w-auto`.
3. THE CollateralCard SHALL render the loan-ID input with `w-full` and `min-h-[44px]`.

### Requirement 8: Responsive RepayPanel Component

**User Story:** As a mobile user repaying a loan, I want all inputs and the repay button to be full-width and easy to tap, so that I can submit a repayment without layout issues.

#### Acceptance Criteria

1. THE RepayPanel SHALL render all `<input>` elements with `w-full` and `min-h-[44px]`.
2. THE RepayPanel SHALL render the Repay button with `w-full` and `min-h-[44px]`.

### Requirement 9: Responsive WalletConnect Component

**User Story:** As a mobile user, I want the wallet connect button to be large enough to tap reliably, so that I can connect my Freighter wallet without frustration.

#### Acceptance Criteria

1. THE WalletConnect SHALL render the Connect button as a Touch_Target with `min-h-[44px]` and horizontal padding of at least `px-4`.
2. THE WalletConnect SHALL render the connected-address display with `w-full` so it does not overflow on narrow viewports.

### Requirement 10: Responsive HealthGauge Component

**User Story:** As a mobile user, I want the health factor gauge to scale to the available width, so that it is readable on any screen size.

#### Acceptance Criteria

1. THE HealthGauge SHALL use `w-full` on its progress bar container so the gauge fills the available width on all viewport sizes.

### Requirement 11: Responsive LoanRepaymentCalculator Component

**User Story:** As a mobile user previewing a repayment, I want the breakdown grid and inputs to be readable on a small screen, so that I can review principal, interest, and fees before confirming.

#### Acceptance Criteria

1. THE LoanRepaymentCalculator SHALL render all `<input>` elements with `w-full` and `min-h-[44px]`.
2. THE LoanRepaymentCalculator SHALL render the breakdown grid as a single column (`grid-cols-1`) on a Mobile_Viewport and two columns (`md:grid-cols-2`) on a Desktop_Viewport.
3. THE LoanRepaymentCalculator SHALL render the Proceed to Repay button with `w-full` and `min-h-[44px]`.

### Requirement 12: Fix StellarUtils TypeScript-in-JS File

**User Story:** As a developer, I want the StellarUtils module to compile without errors, so that the build does not fail due to TypeScript syntax in a `.js` file.

#### Acceptance Criteria

1. THE StellarUtils file SHALL be renamed from `stellarUtils.js` to `stellarUtils.ts` so the TypeScript compiler processes it correctly.
2. WHEN the file is renamed, THE App SHALL update all import paths that reference `stellarUtils.js` or `stellarUtils` to resolve to the new `.ts` file without breaking existing functionality.
3. IF the renamed file contains any TypeScript syntax errors, THEN THE StellarUtils file SHALL be corrected so the project builds without type errors.
