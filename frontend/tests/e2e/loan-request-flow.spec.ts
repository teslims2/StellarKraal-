/**
 * E2E tests for the loan request wizard flow — Issue #1069
 *
 * Covers:
 *  1. Happy path: all 4 wizard steps with mock wallet + API fixtures
 *  2. Wallet connect failure: UI surfaces the error gracefully
 *  3. API error response: collateral registration failure shown in UI
 *
 * All network calls are intercepted via Playwright route mocks so no real
 * Stellar network or backend is required.
 */

import { test, expect } from "@playwright/test";

const WALLET_ADDRESS = "GTESTJOSHUA200WALLETADDRESS1234567890ABCDEF";
const COLLATERAL_ID = "42";
const LOAN_ID = "7";

// ─── Shared wallet mock helper ────────────────────────────────────────────────

function injectSuccessWallet(walletAddress: string) {
  return {
    async isConnected() {
      return { isConnected: true };
    },
    async isAllowed() {
      return { isAllowed: true };
    },
    async setAllowed() {
      return { isAllowed: true };
    },
    async getAddress() {
      return { address: walletAddress };
    },
    async signTransaction(xdr: string) {
      return { signedTxXdr: `${xdr}-signed` };
    },
  };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

test.describe("loan request wizard — happy path", () => {
  test("completes all 4 steps: collateral → amount → review → confirm", async ({
    page,
  }) => {
    let submissionCount = 0;

    // Inject a fully-functional mock Freighter wallet
    await page.addInitScript(
      ({ walletAddress }) => {
        window.__STELLARKRAAL_E2E__ = {
          async isConnected() {
            return { isConnected: true };
          },
          async isAllowed() {
            return { isAllowed: true };
          },
          async setAllowed() {
            return { isAllowed: true };
          },
          async getAddress() {
            return { address: walletAddress };
          },
          async signTransaction(xdr: string) {
            return { signedTxXdr: `${xdr}-signed` };
          },
          async submitSignedXdr() {
            (window as unknown as Record<string, unknown>).__submissionCount__ =
              ((
                (window as unknown as Record<string, unknown>)
                  .__submissionCount__ as number
              ) || 0) + 1;
            const count = (
              window as unknown as Record<string, unknown>
            ).__submissionCount__ as number;
            return count === 1 ? "42" : "7";
          },
        };
      },
      { walletAddress: WALLET_ADDRESS }
    );

    // Mock API routes
    await page.route("**/api/collateral/register", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xdr: "mock-collateral-xdr" }),
      });
    });

    await page.route("**/api/v1/loans/estimate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ originationFee: 5_000, totalAmount: 205_000 }),
      });
    });

    await page.route("**/api/loan/request", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xdr: "mock-loan-xdr" }),
      });
    });

    await page.route("**/api/loans", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: LOAN_ID,
            borrower: WALLET_ADDRESS,
            amount: 200_000,
            status: "active",
            createdAt: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.route("**/api/transactions**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route("**/api/health/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ health_factor: 1.8 }),
      });
    });

    // ── Step 1: Navigate and connect wallet ──────────────────────────────────
    await page.goto("/borrow");

    const connectBtn = page.getByRole("button", {
      name: /connect freighter wallet/i,
    });
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();
    await expect(page.getByText(WALLET_ADDRESS.slice(0, 8))).toBeVisible();

    // ── Step 1 of 4: Collateral ──────────────────────────────────────────────
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await page.getByLabel(/animal type/i).selectOption("cattle");
    await page.getByLabel("Count").fill("3");
    await page.getByLabel(/appraised value/i).fill("800000");
    await page.getByRole("button", { name: /register & continue/i }).click();

    // ── Step 2 of 4: Amount ──────────────────────────────────────────────────
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await page.getByLabel(/loan amount in stroops/i).fill("200000");
    await page.getByRole("button", { name: /review terms/i }).click();

    // ── Step 3 of 4: Review ──────────────────────────────────────────────────
    await expect(page.getByText("Step 3 of 4")).toBeVisible();
    await page.getByRole("button", { name: /confirm & submit/i }).click();

    // ── Step 4 of 4: Confirm ─────────────────────────────────────────────────
    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await expect(page.getByText(COLLATERAL_ID)).toBeVisible();
    await page.getByRole("button", { name: /submit loan request/i }).click();

    // Loan disbursed confirmation
    await expect(page.getByText(/Loan disbursed!/i)).toContainText(LOAN_ID);

    // ── Verify loans page reflects the new loan ──────────────────────────────
    await page.goto("/loans");
    await expect(page.getByText(`Loan #${LOAN_ID}`)).toBeVisible();
    await expect(page.getByText(WALLET_ADDRESS)).toBeVisible();
    await expect(page.getByText("active")).toBeVisible();

    void submissionCount; // suppress unused-var warning
  });
});

// ─── Wallet connect failure ───────────────────────────────────────────────────

test.describe("loan request wizard — wallet connect failure", () => {
  test("shows an error message when Freighter rejects the connection", async ({
    page,
  }) => {
    // Inject a mock wallet that throws on setAllowed (user denies permission)
    await page.addInitScript(() => {
      window.__STELLARKRAAL_E2E__ = {
        async isConnected() {
          return { isConnected: false };
        },
        async isAllowed() {
          return { isAllowed: false };
        },
        async setAllowed() {
          throw new Error("User denied wallet access");
        },
        async getAddress() {
          throw new Error("Not connected");
        },
        async signTransaction(_xdr: string) {
          throw new Error("Not connected");
        },
        async submitSignedXdr() {
          throw new Error("Not connected");
        },
      };
    });

    await page.goto("/borrow");

    const connectBtn = page.getByRole("button", {
      name: /connect freighter wallet/i,
    });
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    // The UI should surface a wallet error — either a toast, alert, or inline message
    const errorLocator = page
      .getByRole("alert")
      .or(page.getByText(/denied|failed|error|could not connect/i).first());
    await expect(errorLocator).toBeVisible({ timeout: 8_000 });

    // Wallet address must NOT be shown — user is not connected
    await expect(page.getByText(WALLET_ADDRESS.slice(0, 8))).not.toBeVisible();
  });
});

// ─── API error response ───────────────────────────────────────────────────────

test.describe("loan request wizard — API error handling", () => {
  test("displays an error when collateral registration API returns 500", async ({
    page,
  }) => {
    // Inject a healthy wallet so we can reach the collateral step
    await page.addInitScript(
      ({ walletAddress }) => {
        window.__STELLARKRAAL_E2E__ = {
          async isConnected() {
            return { isConnected: true };
          },
          async isAllowed() {
            return { isAllowed: true };
          },
          async setAllowed() {
            return { isAllowed: true };
          },
          async getAddress() {
            return { address: walletAddress };
          },
          async signTransaction(xdr: string) {
            return { signedTxXdr: `${xdr}-signed` };
          },
          async submitSignedXdr() {
            return "irrelevant-hash";
          },
        };
      },
      { walletAddress: WALLET_ADDRESS }
    );

    // Mock the collateral registration endpoint to return a server error
    await page.route("**/api/collateral/register", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    await page.route("**/api/transactions**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.goto("/borrow");

    // Connect wallet
    const connectBtn = page.getByRole("button", {
      name: /connect freighter wallet/i,
    });
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();
    await expect(page.getByText(WALLET_ADDRESS.slice(0, 8))).toBeVisible();

    // Fill collateral step and submit
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await page.getByLabel(/animal type/i).selectOption("cattle");
    await page.getByLabel("Count").fill("2");
    await page.getByLabel(/appraised value/i).fill("500000");
    await page.getByRole("button", { name: /register & continue/i }).click();

    // UI must show an error — toast or inline error message
    const errorLocator = page
      .getByRole("alert")
      .or(
        page
          .getByText(/server error|failed|something went wrong|error/i)
          .first()
      );
    await expect(errorLocator).toBeVisible({ timeout: 8_000 });

    // Must NOT advance to Step 2
    await expect(page.getByText("Step 2 of 4")).not.toBeVisible();
  });

  test("displays an error when loan request API returns 422 (validation error)", async ({
    page,
  }) => {
    let collateralCalled = false;

    await page.addInitScript(
      ({ walletAddress }) => {
        window.__STELLARKRAAL_E2E__ = {
          async isConnected() {
            return { isConnected: true };
          },
          async isAllowed() {
            return { isAllowed: true };
          },
          async setAllowed() {
            return { isAllowed: true };
          },
          async getAddress() {
            return { address: walletAddress };
          },
          async signTransaction(xdr: string) {
            return { signedTxXdr: `${xdr}-signed` };
          },
          async submitSignedXdr() {
            return "99";
          },
        };
      },
      { walletAddress: WALLET_ADDRESS }
    );

    // Collateral succeeds
    await page.route("**/api/collateral/register", async (route) => {
      collateralCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xdr: "ok-xdr" }),
      });
    });

    // Estimate succeeds
    await page.route("**/api/v1/loans/estimate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ originationFee: 1_000, totalAmount: 101_000 }),
      });
    });

    // Loan request fails with 422
    await page.route("**/api/loan/request", async (route) => {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Loan amount exceeds maximum LTV for this collateral",
        }),
      });
    });

    await page.route("**/api/transactions**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route("**/api/health/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ health_factor: 1.5 }),
      });
    });

    await page.goto("/borrow");

    // Connect wallet and walk wizard to the loan submission step
    await page
      .getByRole("button", { name: /connect freighter wallet/i })
      .click();
    await expect(page.getByText(WALLET_ADDRESS.slice(0, 8))).toBeVisible();

    await page.getByLabel(/animal type/i).selectOption("cattle");
    await page.getByLabel("Count").fill("1");
    await page.getByLabel(/appraised value/i).fill("300000");
    await page.getByRole("button", { name: /register & continue/i }).click();

    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await page.getByLabel(/loan amount in stroops/i).fill("100000");
    await page.getByRole("button", { name: /review terms/i }).click();

    await expect(page.getByText("Step 3 of 4")).toBeVisible();
    await page.getByRole("button", { name: /confirm & submit/i }).click();

    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await page.getByRole("button", { name: /submit loan request/i }).click();

    // UI must show the 422 error
    const errorLocator = page
      .getByRole("alert")
      .or(page.getByText(/exceeds|LTV|failed|error/i).first());
    await expect(errorLocator).toBeVisible({ timeout: 8_000 });

    // Must NOT show success
    await expect(
      page.getByText(/Loan disbursed!/i)
    ).not.toBeVisible();

    void collateralCalled;
  });
});
