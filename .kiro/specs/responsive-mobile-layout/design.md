# Design Document — Responsive Mobile Layout

## Overview

StellarKraal targets African emerging markets where most users access the web on mobile devices (375–414 px wide). The current frontend renders a desktop-only layout, causing horizontal overflow, unreadable text, and inaccessible touch targets on small screens.

This design covers:

1. A new **Navbar** component with a hamburger menu on mobile and a horizontal link row on desktop.
2. **Layout** updates — Navbar inclusion, `overflow-x-hidden`, and `px-4` on `<body>`.
3. **Responsive page updates** — `page.tsx`, `dashboard/page.tsx`, `borrow/page.tsx`.
4. **Responsive component updates** — LoanForm, CollateralCard, RepayPanel, WalletConnect, HealthGauge, LoanRepaymentCalculator.
5. **Touch target compliance** — every button, input, and select gets `min-h-[44px]`.
6. **No horizontal scroll** — no fixed-width elements wider than the viewport.

All changes use only existing Tailwind utility classes and the custom color tokens `brown`, `gold`, and `cream`. No new dependencies, no new CSS files.

---

## Architecture

The application is a Next.js 13+ App Router project. The root `layout.tsx` wraps every page, making it the single insertion point for the Navbar. All responsive behaviour is expressed through Tailwind responsive prefixes (`md:`, `lg:`) applied directly to JSX elements.

```
layout.tsx
  └── <body>                  ← overflow-x-hidden px-4 bg-cream text-brown min-h-screen
        ├── <Navbar />         ← new component, always rendered
        └── {children}         ← page content
              ├── page.tsx     (Home)
              ├── dashboard/page.tsx
              └── borrow/page.tsx
                    └── components/
                          LoanForm, CollateralCard, RepayPanel,
                          WalletConnect, HealthGauge, LoanRepaymentCalculator
```

No new routing, no new data-fetching, no new state management libraries are introduced.

---

## Components and Interfaces

### Navbar (`src/components/Navbar.tsx`)

**Responsibility:** Render the site-wide navigation bar. On mobile it shows a hamburger button that toggles a vertical drawer. On desktop it shows a horizontal link row.

**Props:** None (reads no external state; uses Next.js `Link` and `usePathname` for active-link styling).

**Internal state:**

| State | Type | Purpose |
|---|---|---|
| `isOpen` | `boolean` | Whether the mobile drawer is visible |

**Behaviour:**

- Hamburger button (`md:hidden`) toggles `isOpen`.
- Clicking any nav link sets `isOpen = false` (closes drawer).
- Desktop nav container uses `hidden md:flex` so it is invisible on mobile.
- Mobile drawer uses `isOpen ? 'flex' : 'hidden'` with `flex-col` layout.

**Tailwind structure (simplified):**

```
<nav class="bg-brown text-cream w-full">
  <div class="flex items-center justify-between px-4 h-14">
    <Link href="/">🐄 StellarKraal</Link>          ← logo
    <button class="md:hidden min-h-[44px] min-w-[44px]">☰</button>  ← hamburger
    <div class="hidden md:flex gap-6">              ← desktop links
      <Link>Home</Link>
      <Link>Dashboard</Link>
      <Link>Borrow</Link>
    </div>
  </div>
  <div class="[isOpen ? flex : hidden] flex-col md:hidden px-4 pb-4 gap-2">
    ← mobile drawer links, each min-h-[44px]
  </div>
</nav>
```

---

### Layout (`src/app/layout.tsx`)

**Changes:**

- Add `overflow-x-hidden px-4` to `<body>` className.
- Import and render `<Navbar />` above `{children}`.

---

### Home Page (`src/app/page.tsx`)

**Changes:**

| Element | Before | After |
|---|---|---|
| `<h1>` | `text-5xl` | `text-4xl md:text-5xl` |
| CTA button container | `flex gap-4 flex-wrap justify-center` | `flex flex-col md:flex-row gap-4 items-center` |
| Each CTA `<Link>` | `px-6 py-3` | `px-6 py-3 min-h-[44px] flex items-center justify-center` |
| Description `<p>` | `max-w-md` | `max-w-sm md:max-w-md` |

---

### Dashboard Page (`src/app/dashboard/page.tsx`)

**Changes:**

| Element | Before | After |
|---|---|---|
| Health Factor input row | `flex gap-2 items-center` | `flex flex-col md:flex-row gap-2` |
| Health Factor `<input>` | `border … flex-1` | `border … w-full min-h-[44px]` |
| Health Factor `<button>` | `px-4 py-2` | `min-h-[44px] px-4 w-full md:w-auto` |

The outer `<main>` already uses `max-w-2xl mx-auto px-4 py-10` which is correct. Sections are already stacked vertically (block layout).

---

### Borrow Page (`src/app/borrow/page.tsx`)

**Changes:**

| Element | Before | After |
|---|---|---|
| `<main>` | `max-w-lg mx-auto px-4 py-10` | `w-full max-w-lg mx-auto px-4 py-10` |

---

### LoanForm (`src/components/LoanForm.tsx`)

**Changes:**

| Element | Before | After |
|---|---|---|
| `<select>` | `… px-3 py-2` | `… px-3 py-2 min-h-[44px]` |
| Each `<input>` | `… px-3 py-2` | `… px-3 py-2 min-h-[44px]` |
| Submit buttons | `… py-2.5` | `… min-h-[44px]` (replace `py-2.5`) |
| Form container | `space-y-4` | already `space-y-4` — keep |
| Labels | absent | add `<label>` above each field |

Labels are added as `<label className="block text-sm font-medium text-brown mb-1">` immediately before each input/select.

---

### CollateralCard (`src/components/CollateralCard.tsx`)

**Changes:**

| Element | Before | After |
|---|---|---|
| Input+button container | `flex gap-2` | `flex flex-col md:flex-row gap-2` |
| `<input>` | `… flex-1` | `w-full min-h-[44px]` |
| `<button>` | `px-4 py-2` | `min-h-[44px] w-full md:w-auto px-4` |

---

### RepayPanel (`src/components/RepayPanel.tsx`)

**Changes:**

| Element | Before | After |
|---|---|---|
| Each `<input>` | `… px-3 py-2` | `… px-3 py-2 min-h-[44px]` |
| Repay `<button>` | `… py-2.5` | `… min-h-[44px]` |

---

### WalletConnect (`src/components/WalletConnect.tsx`)

**Changes:**

| Element | Before | After |
|---|---|---|
| Connect `<button>` | `px-5 py-2.5` | `min-h-[44px] px-4` |
| Address display `<div>` | `bg-brown/10 … px-4 py-3` | add `w-full` |

---

### HealthGauge (`src/components/HealthGauge.tsx`)

**Changes:** The progress bar container already has `w-full`. No changes required — requirement 10.1 is already satisfied by the current implementation.

---

### LoanRepaymentCalculator (`src/components/LoanRepaymentCalculator.tsx`)

**Changes:**

| Element | Before | After |
|---|---|---|
| Each `<input>` | `… px-3 py-2` | `… px-3 py-2 min-h-[44px]` |
| Breakdown grid | `grid grid-cols-2 gap-3` | `grid grid-cols-1 md:grid-cols-2 gap-3` |
| Proceed button | `… py-2.5` | `… min-h-[44px]` |

---

## Data Models

No new data models are introduced. This feature is purely presentational — it modifies Tailwind class strings on existing JSX elements and adds one new stateful UI component (Navbar).

The only state added is `isOpen: boolean` inside Navbar, which is local component state with no persistence or external dependencies.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

This feature is primarily a UI/CSS change. Most acceptance criteria are class-presence checks (EXAMPLE tests). However, three universal properties emerge that hold across all interactive elements and are worth expressing as property-based tests: touch target height, input full-width, and hamburger minimum width.

### Property 1: Touch target height

*For any* button, input, or select element rendered by any component in the application (Navbar, LoanForm, CollateralCard, RepayPanel, WalletConnect, LoanRepaymentCalculator, and the Dashboard health-factor section), the element's className string SHALL contain `min-h-[44px]`.

**Validates: Requirements 1.6, 3.3, 4.3, 6.1, 6.2, 8.1, 8.2, 9.1, 11.1, 11.3**

### Property 2: Input and select full width

*For any* `<input>` or `<select>` element rendered by any component in the application, the element's className string SHALL contain `w-full`.

**Validates: Requirements 6.1, 7.3, 8.1, 9.2, 11.1**

### Property 3: Hamburger button minimum width

*For any* render of the Navbar component, the hamburger toggle button SHALL have both `min-h-[44px]` and `min-w-[44px]` in its className.

**Validates: Requirements 1.6**

---

## Error Handling

### Navbar drawer state
The `isOpen` toggle is a simple boolean with no error path. No error handling needed.

### Layout body classes
Tailwind class strings are static — no runtime error path.

### Component class additions
All changes are additive Tailwind class strings on existing elements. No new async operations, no new error paths.

### Pre-existing error handling preserved
- WalletConnect: Freighter unavailable → mock address fallback (unchanged).
- LoanForm, RepayPanel: `catch (e: any)` → `setStatus(\`❌ \${e.message}\`)` (unchanged).
- LoanRepaymentCalculator: debounced preview fetch with error state (unchanged).

---

## Testing Strategy

### Approach

This feature is a UI/CSS change. The appropriate testing strategy is:

- **Example-based unit tests** for specific class-presence assertions (most acceptance criteria).
- **Property-based tests** for the three universal properties identified above.
- No integration tests are needed — no new API calls, no new infrastructure.

PBT is applicable here because the three properties hold universally across all rendered elements, and a property-based test can enumerate or generate the set of interactive elements and assert the invariant on each one.

### Property-Based Testing

**Library:** `fast-check` (already available in the JS/TS ecosystem; no new dependency if already present in devDependencies — if not, it is a dev-only addition consistent with the "no new runtime dependencies" constraint).

**Configuration:** Minimum 100 iterations per property test.

**Tag format:** `Feature: responsive-mobile-layout, Property {N}: {property_text}`

#### Property Test 1 — Touch target height

```
// Feature: responsive-mobile-layout, Property 1: touch target height
// For any interactive element rendered by any component, className contains min-h-[44px]
fc.assert(
  fc.property(fc.constantFrom(...interactiveElements), (el) => {
    expect(el.className).toContain('min-h-[44px]');
  }),
  { numRuns: 100 }
);
```

The generator `interactiveElements` is built by rendering each component with representative props and collecting all `button`, `input`, and `select` nodes from the output.

#### Property Test 2 — Input full width

```
// Feature: responsive-mobile-layout, Property 2: input full width
// For any input or select rendered by any component, className contains w-full
fc.assert(
  fc.property(fc.constantFrom(...inputElements), (el) => {
    expect(el.className).toContain('w-full');
  }),
  { numRuns: 100 }
);
```

#### Property Test 3 — Hamburger minimum width

```
// Feature: responsive-mobile-layout, Property 3: hamburger min-w-[44px]
// The hamburger button in Navbar always has min-w-[44px]
fc.assert(
  fc.property(fc.constant(null), () => {
    const { getByRole } = render(<Navbar />);
    const hamburger = getByRole('button', { name: /menu/i });
    expect(hamburger.className).toContain('min-w-[44px]');
    expect(hamburger.className).toContain('min-h-[44px]');
  }),
  { numRuns: 100 }
);
```

### Unit Tests (Example-Based)

Each acceptance criterion not covered by a property test gets one example-based test:

| Test | Assertion |
|---|---|
| Layout renders Navbar | `<Navbar>` present in layout output |
| Layout body classes | body has `overflow-x-hidden` and `px-4` |
| Navbar desktop links hidden on mobile | nav container has `hidden md:flex` |
| Navbar hamburger hidden on desktop | hamburger has `md:hidden` |
| Navbar drawer toggles on click | click hamburger → drawer visible; click again → hidden |
| Navbar drawer closes on link click | open drawer, click link → drawer hidden |
| Home h1 responsive text size | h1 has `text-4xl md:text-5xl` |
| Home CTA stack direction | container has `flex-col md:flex-row` |
| Home paragraph max-width | `<p>` has `max-w-sm` |
| Dashboard health factor flex-col | health factor row has `flex-col md:flex-row` |
| Borrow page w-full | main has `w-full` |
| LoanForm space-y-4 | form container has `space-y-4` |
| LoanForm labels above inputs | label precedes input in DOM order |
| CollateralCard flex-col md:flex-row | input+button container has `flex-col md:flex-row` |
| LoanRepaymentCalculator grid responsive | grid has `grid-cols-1 md:grid-cols-2` |
| WalletConnect address display w-full | address div has `w-full` |
| HealthGauge progress bar w-full | progress bar container has `w-full` |

### Test File Location

New tests go in `frontend/src/__tests__/` alongside the existing `HealthGauge.test.tsx` and `LoanRepaymentCalculator.test.tsx`.

- `frontend/src/__tests__/Navbar.test.tsx`
- `frontend/src/__tests__/responsive.property.test.tsx` (property tests for Properties 1–3)
- Existing test files are updated to assert new touch-target and width classes.
