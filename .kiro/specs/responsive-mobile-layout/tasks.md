# Implementation Plan: Responsive Mobile Layout

## Overview

Add a fully responsive mobile layout to StellarKraal using Tailwind CSS utility classes. This includes a new Navbar component with a hamburger menu, layout-level overflow/padding fixes, and touch-target compliance across all pages and components.

## Tasks

- [x] 1. Create Navbar component (`src/components/Navbar.tsx`)
  - Implement hamburger toggle with `isOpen` boolean state
  - Desktop links use `hidden md:flex gap-6`; hamburger uses `md:hidden`
  - Mobile drawer uses `flex-col` when open, `hidden` when closed
  - All nav links and hamburger button have `min-h-[44px] min-w-[44px]`
  - Use `bg-brown text-cream` color scheme
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2. Update Layout (`src/app/layout.tsx`)
  - Import and render `<Navbar />` above `{children}`
  - Add `overflow-x-hidden px-4` to `<body>` className
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Update Home Page (`src/app/page.tsx`)
  - Change `<h1>` from `text-5xl` to `text-4xl md:text-5xl`
  - Change CTA container from `flex gap-4 flex-wrap justify-center` to `flex flex-col md:flex-row gap-4 items-center`
  - Add `min-h-[44px] flex items-center justify-center` to each CTA `<Link>`
  - Change `<p>` from `max-w-md` to `max-w-sm md:max-w-md`
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Update Dashboard Page (`src/app/dashboard/page.tsx`)
  - Change Health Factor input row from `flex gap-2 items-center` to `flex flex-col md:flex-row gap-2`
  - Add `w-full min-h-[44px]` to Health Factor `<input>` (remove `flex-1`)
  - Add `min-h-[44px] w-full md:w-auto` to Health Factor `<button>` (replace `px-4 py-2`)
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Update Borrow Page (`src/app/borrow/page.tsx`)
  - Add `w-full` to `<main>` className
  - _Requirements: 5.1, 5.2_

- [x] 6. Update LoanForm component (`src/components/LoanForm.tsx`)
  - Add `min-h-[44px]` to `<select>` and all `<input>` elements
  - Replace `py-2.5` with `min-h-[44px]` on submit buttons
  - Add `<label>` elements above each field with `block text-sm font-medium text-brown mb-1`
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 7. Update CollateralCard component (`src/components/CollateralCard.tsx`)
  - Change input+button container from `flex gap-2` to `flex flex-col md:flex-row gap-2`
  - Change `<input>` from `flex-1` to `w-full min-h-[44px]`
  - Change `<button>` to `min-h-[44px] w-full md:w-auto px-4`
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 8. Update RepayPanel component (`src/components/RepayPanel.tsx`)
  - Add `min-h-[44px]` to all `<input>` elements
  - Replace `py-2.5` with `min-h-[44px]` on Repay button
  - _Requirements: 8.1, 8.2_

- [x] 9. Update WalletConnect component (`src/components/WalletConnect.tsx`)
  - Replace `px-5 py-2.5` with `min-h-[44px] px-4` on Connect button
  - Add `w-full` to address display `<div>`
  - _Requirements: 9.1, 9.2_

- [x] 10. Update LoanRepaymentCalculator component (`src/components/LoanRepaymentCalculator.tsx`)
  - Add `min-h-[44px]` to all `<input>` elements
  - Change breakdown grid from `grid grid-cols-2 gap-3` to `grid grid-cols-1 md:grid-cols-2 gap-3`
  - Replace `py-2.5` with `min-h-[44px]` on Proceed to Repay button
  - _Requirements: 11.1, 11.2, 11.3_

- [x] 11. Write property-based tests (`src/components/Navbar.tsx` + responsive properties)
  - [x] 11.1 Create `frontend/src/__tests__/Navbar.test.tsx` with unit tests for hamburger toggle, drawer close on link click, desktop/mobile class assertions
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x]* 11.2 Write property test for touch target height (Property 1)
    - **Property 1: Touch target height — every button/input/select has `min-h-[44px]`**
    - **Validates: Requirements 1.6, 3.3, 4.3, 6.1, 6.2, 8.1, 8.2, 9.1, 11.1, 11.3**
  - [x]* 11.3 Write property test for input full width (Property 2)
    - **Property 2: Input full width — every input/select has `w-full`**
    - **Validates: Requirements 6.1, 7.3, 8.1, 9.2, 11.1**
  - [x]* 11.4 Write property test for hamburger minimum width (Property 3)
    - **Property 3: Hamburger button always has `min-w-[44px]` and `min-h-[44px]`**
    - **Validates: Requirements 1.6**

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All changes use only existing Tailwind utility classes and custom color tokens (`brown`, `gold`, `cream`)
- No new runtime dependencies introduced
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties across all interactive elements
