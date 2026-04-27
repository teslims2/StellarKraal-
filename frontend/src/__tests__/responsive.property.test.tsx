/**
 * Responsive Mobile Layout — Property-Based Tests
 *
 * Feature: responsive-mobile-layout
 *
 * These tests verify three universal properties that must hold across all
 * interactive elements rendered by the application's components:
 *
 *   Property 1: Touch target height — every button/input/select has min-h-[44px]
 *   Property 2: Input full width — every input/select has w-full
 *   Property 3: Hamburger button always has min-w-[44px] and min-h-[44px]
 *
 * NOTE: fast-check is used for property-based testing when available.
 * Install with: npm install --save-dev fast-check
 * Until then, tests enumerate all interactive elements exhaustively.
 */

import React from "react";
import { render, act } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

jest.mock("next/link", () => {
  const MockLink = ({ href, children, onClick, className }: any) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

jest.mock("../lib/stellarUtils", () => ({
  healthColor: (bps: number) => (bps >= 10_000 ? "#16a34a" : "#dc2626"),
  formatStroops: (s: number) => `${s / 1e7} XLM`,
  submitSignedXdr: jest.fn(),
}));

jest.mock("@stellar/freighter-api", () => ({
  isConnected: jest.fn().mockResolvedValue(false),
  setAllowed: jest.fn().mockResolvedValue(undefined),
  getAddress: jest.fn().mockResolvedValue("GTESTWALLET1234567890"),
  signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
}));

// ── Component imports ─────────────────────────────────────────────────────────

import Navbar from "../components/Navbar";
import LoanForm from "../components/LoanForm";
import CollateralCard from "../components/CollateralCard";
import RepayPanel from "../components/RepayPanel";
import WalletConnect from "../components/WalletConnect";
import LoanRepaymentCalculator from "../components/LoanRepaymentCalculator";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInteractiveElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("button, input, select")
  );
}

function getInputAndSelectElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("input, select")
  );
}

// ── Property 1: Touch target height ──────────────────────────────────────────
// Feature: responsive-mobile-layout, Property 1: touch target height
// For any button/input/select rendered by any component, className contains min-h-[44px]

describe("Property 1: Touch target height — all buttons/inputs/selects have min-h-[44px]", () => {
  it("Navbar — all interactive elements have min-h-[44px]", () => {
    const { container } = render(<Navbar />);
    const elements = getInteractiveElements(container);
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach((el) => {
      expect(el.className).toContain("min-h-[44px]");
    });
  });

  it("LoanForm (collateral step) — all interactive elements have min-h-[44px]", () => {
    const { container } = render(<LoanForm walletAddress="GTESTWALLET1234567890" />);
    const elements = getInteractiveElements(container);
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach((el) => {
      expect(el.className).toContain("min-h-[44px]");
    });
  });

  it("CollateralCard — all interactive elements have min-h-[44px]", () => {
    const { container } = render(<CollateralCard walletAddress="GTESTWALLET1234567890" />);
    const elements = getInteractiveElements(container);
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach((el) => {
      expect(el.className).toContain("min-h-[44px]");
    });
  });

  it("RepayPanel — all interactive elements have min-h-[44px]", () => {
    const { container } = render(
      <RepayPanel walletAddress="GTESTWALLET1234567890" />
    );
    const elements = getInteractiveElements(container);
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach((el) => {
      expect(el.className).toContain("min-h-[44px]");
    });
  });

  it("WalletConnect (disconnected) — connect button has min-h-[44px]", () => {
    const { container } = render(<WalletConnect onConnect={jest.fn()} />);
    const elements = getInteractiveElements(container);
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach((el) => {
      expect(el.className).toContain("min-h-[44px]");
    });
  });

  it("LoanRepaymentCalculator — all interactive elements have min-h-[44px]", () => {
    const { container } = render(
      <LoanRepaymentCalculator onProceed={jest.fn()} />
    );
    const elements = getInteractiveElements(container);
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach((el) => {
      expect(el.className).toContain("min-h-[44px]");
    });
  });
});

// ── Property 2: Input full width ──────────────────────────────────────────────
// Feature: responsive-mobile-layout, Property 2: input full width
// For any input/select rendered by any component, className contains w-full

describe("Property 2: Input full width — all inputs/selects have w-full", () => {
  it("LoanForm (collateral step) — all inputs/selects have w-full", () => {
    const { container } = render(<LoanForm walletAddress="GTESTWALLET1234567890" />);
    const elements = getInputAndSelectElements(container);
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach((el) => {
      expect(el.className).toContain("w-full");
    });
  });

  it("CollateralCard — all inputs have w-full", () => {
    const { container } = render(<CollateralCard walletAddress="GTESTWALLET1234567890" />);
    const elements = getInputAndSelectElements(container);
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach((el) => {
      expect(el.className).toContain("w-full");
    });
  });

  it("RepayPanel — all inputs have w-full", () => {
    const { container } = render(
      <RepayPanel walletAddress="GTESTWALLET1234567890" />
    );
    const elements = getInputAndSelectElements(container);
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach((el) => {
      expect(el.className).toContain("w-full");
    });
  });

  it("LoanRepaymentCalculator — all inputs have w-full", () => {
    const { container } = render(
      <LoanRepaymentCalculator onProceed={jest.fn()} />
    );
    const elements = getInputAndSelectElements(container);
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach((el) => {
      expect(el.className).toContain("w-full");
    });
  });
});

// ── Property 3: Hamburger minimum width ───────────────────────────────────────
// Feature: responsive-mobile-layout, Property 3: hamburger min-w-[44px]
// The hamburger toggle button in Navbar always has min-w-[44px] and min-h-[44px]

describe("Property 3: Hamburger button always has min-w-[44px] and min-h-[44px]", () => {
  it("Navbar hamburger button has min-w-[44px]", () => {
    const { container } = render(<Navbar />);
    const hamburger = container.querySelector("button.md\\:hidden") as HTMLElement;
    expect(hamburger).toBeTruthy();
    expect(hamburger.className).toContain("min-w-[44px]");
  });

  it("Navbar hamburger button has min-h-[44px]", () => {
    const { container } = render(<Navbar />);
    const hamburger = container.querySelector("button.md\\:hidden") as HTMLElement;
    expect(hamburger).toBeTruthy();
    expect(hamburger.className).toContain("min-h-[44px]");
  });

  it("Navbar hamburger button retains min-w-[44px] and min-h-[44px] after toggle", () => {
    const { container } = render(<Navbar />);
    const hamburger = container.querySelector("button.md\\:hidden") as HTMLElement;

    // Simulate multiple renders/toggles — property must hold in all states
    [1, 2, 3, 4, 5].forEach(() => {
      act(() => { hamburger.click(); });
      expect(hamburger.className).toContain("min-w-[44px]");
      expect(hamburger.className).toContain("min-h-[44px]");
    });
  });
});
