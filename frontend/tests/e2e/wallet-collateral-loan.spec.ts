import { test, expect } from "@playwright/test";

const WALLET_ADDRESS = "GTESTWALLETADDRESS1234567890ABCDEFGH1234567890";
const COLLATERAL_ID = "101";
const LOAN_ID = "1";

type LoanRow = {
  id: string;
  borrower: string;
  amount: number;
  status: string;
  createdAt: string;
};

test.describe("critical borrowing journey", () => {
  test("connects a mocked Freighter wallet, registers collateral, requests a loan, and shows it on the loans page", async ({ page }) => {
    const loans: LoanRow[] = [];

    await page.addInitScript(
      ({ walletAddress }) => {
        const state = {
          submissions: 0,
        };

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
            state.submissions += 1;
            return state.submissions === 1 ? "101" : "1";
          },
        };
      },
      { walletAddress: WALLET_ADDRESS }
    );

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
        body: JSON.stringify({ originationFee: 10_000, totalAmount: 210_000 }),
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
        body: JSON.stringify(loans),
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

    await expect(page.getByRole("button", { name: /connect freighter wallet/i })).toBeVisible();
    await page.getByRole("button", { name: /connect freighter wallet/i }).click();
    await expect(page.getByText(WALLET_ADDRESS.slice(0, 8))).toBeVisible();

    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await page.getByLabel(/animal type/i).selectOption("cattle");
    await page.getByLabel("Count").fill("5");
    await page.getByLabel(/appraised value/i).fill("1200000");
    await page.getByRole("button", { name: /register & continue/i }).click();

    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await page.getByLabel(/loan amount in stroops/i).fill("200000");
    await page.getByRole("button", { name: /review terms/i }).click();

    await expect(page.getByText("Step 3 of 4")).toBeVisible();
    await page.getByRole("button", { name: /confirm & submit/i }).click();

    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await expect(page.getByText(COLLATERAL_ID)).toBeVisible();
    await page.getByRole("button", { name: /submit loan request/i }).click();
    await expect(page.getByText(/Loan disbursed!/i)).toContainText(LOAN_ID);

    loans.push({
      id: LOAN_ID,
      borrower: WALLET_ADDRESS,
      amount: 200000,
      status: "active",
      createdAt: new Date("2026-05-26T00:00:00Z").toISOString(),
    });

    await page.goto("/loans");
    await expect(page.getByText(`Loan #${LOAN_ID}`)).toBeVisible();
    await expect(page.getByText(WALLET_ADDRESS)).toBeVisible();
    await expect(page.getByText("active")).toBeVisible();
  });
});
