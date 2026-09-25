import { test, expect } from "@playwright/test";

/**
 * E2E: mobile bottom tab bar (#1088)
 *
 * Below 768px the hamburger drawer is replaced by a fixed bottom tab bar
 * with Dashboard, Loans, Collateral, and Profile.
 */

test.use({ viewport: { width: 375, height: 667 } });

test.describe("Mobile bottom tab bar (< 768px)", () => {
  test("shows the tab bar and hides the hamburger", async ({ page }) => {
    await page.goto("/");

    const tabBar = page.getByRole("navigation", { name: "Mobile bottom navigation" });
    await expect(tabBar).toBeVisible();
    await expect(tabBar.getByRole("link", { name: /dashboard/i })).toBeVisible();
    await expect(tabBar.getByRole("link", { name: /loans/i })).toBeVisible();
    await expect(tabBar.getByRole("link", { name: /collateral/i })).toBeVisible();
    await expect(tabBar.getByRole("link", { name: /profile/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /open menu/i })).toHaveCount(0);

    await tabBar.getByRole("link", { name: /loans/i }).click();
    await expect(page).toHaveURL(/\/loans/);
  });

  test("arrow keys move focus across tabs", async ({ page }) => {
    await page.goto("/");

    const tabBar = page.getByRole("navigation", { name: "Mobile bottom navigation" });
    const dashboard = tabBar.getByRole("link", { name: /dashboard/i });
    await dashboard.focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabBar.getByRole("link", { name: /loans/i })).toBeFocused();
  });
});
