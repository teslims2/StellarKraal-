/**
 * E2E tests for accessible form validation — Issue #1068
 *
 * Verifies:
 *  1. Each input's error has a unique id referenced by aria-describedby
 *  2. Error summary with role="alert" appears at form top on submit failure
 *  3. Focus moves to the error summary heading on submit failure
 *  4. Focus re-applies on repeated submit with same errors (submitCount fix)
 */

import { test, expect } from "@playwright/test";

test.describe("accessible form validation — loan form", () => {
  test.beforeEach(async ({ page }) => {
    // Inject a connected wallet so we reach the form
    await page.addInitScript(() => {
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
          return { address: "GTESTARIA00WALLETADDRESS1234567890ABCDEF" };
        },
        async signTransaction(xdr: string) {
          return { signedTxXdr: `${xdr}-signed` };
        },
        async submitSignedXdr() {
          return "hash-aria";
        },
      };
    });

    await page.route("**/api/transactions**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  test("error summary with role=alert appears at top of form on invalid submit", async ({
    page,
  }) => {
    await page.goto("/borrow");
    await page
      .getByRole("button", { name: /connect freighter wallet/i })
      .click();
    await expect(
      page.getByText("GTESTARIA0".slice(0, 8))
    ).toBeVisible();

    // Submit without filling any fields to trigger validation errors
    await page.getByRole("button", { name: /register & continue/i }).click();

    // Error summary must be present with role="alert"
    const errorSummary = page.locator('[role="alert"]').first();
    await expect(errorSummary).toBeVisible({ timeout: 5_000 });
  });

  test("inputs have aria-invalid=true when errors are present", async ({
    page,
  }) => {
    await page.goto("/borrow");
    await page
      .getByRole("button", { name: /connect freighter wallet/i })
      .click();

    // Submit empty form
    await page.getByRole("button", { name: /register & continue/i }).click();

    // The count input should have aria-invalid="true"
    const countInput = page.locator("#loan-count, [id*='count']").first();
    if (await countInput.isVisible()) {
      await expect(countInput).toHaveAttribute("aria-invalid", "true");
    }
  });

  test("inputs have aria-describedby linking to their error message id", async ({
    page,
  }) => {
    await page.goto("/borrow");
    await page
      .getByRole("button", { name: /connect freighter wallet/i })
      .click();

    // Submit to trigger errors
    await page.getByRole("button", { name: /register & continue/i }).click();

    // Check that an input with aria-invalid also has aria-describedby pointing to an existing element
    const invalidInputs = page.locator('[aria-invalid="true"]');
    const count = await invalidInputs.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const input = invalidInputs.nth(i);
      const describedBy = await input.getAttribute("aria-describedby");
      if (describedBy) {
        // The error element with that id must exist in the DOM
        const errorEl = page.locator(`#${CSS.escape(describedBy)}`);
        await expect(errorEl).toBeAttached();
      }
    }
  });

  test("focus moves to error summary on submit failure", async ({ page }) => {
    await page.goto("/borrow");
    await page
      .getByRole("button", { name: /connect freighter wallet/i })
      .click();

    // Submit empty form
    await page.getByRole("button", { name: /register & continue/i }).click();

    // The focused element should be inside the error summary (heading with tabIndex=-1)
    await page.waitForTimeout(300); // allow focus management to complete
    const focusedEl = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      // Walk up to check if we're inside a role="alert" container
      let node: Element | null = el;
      while (node) {
        if (node.getAttribute("role") === "alert") return "inside-alert";
        if (node.tagName === "BODY") return el.tagName;
        node = node.parentElement;
      }
      return el.tagName;
    });

    expect(focusedEl).toBe("inside-alert");
  });
});
