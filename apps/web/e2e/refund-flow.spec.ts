import { test, expect } from "@playwright/test";

test.describe("RailRefund E2E User Flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Input surface displays title, numeric input, and independence disclaimer", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Calculate your train ticket refund");
    const input = page.locator("#pnr-input");
    await expect(input).toBeVisible();

    // Verify independence disclaimer is present
    await expect(page.locator(".disclaimer")).toContainText(
      "Independent service. Not affiliated with IRCTC or Indian Railways."
    );

    // Verify submit button disabled until 10 digits
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();

    await input.fill("12345");
    await expect(submitBtn).toBeDisabled();

    await input.fill("1234567890");
    await expect(submitBtn).toBeEnabled();
  });

  test("Flow 1: PNR ending in 0 (Confirmed Far-out) renders route, ledger, and explanation", async ({ page }) => {
    await page.locator("#pnr-input").fill("1234567890");
    await page.locator('button[type="submit"]').click();

    // Loading indicator
    await expect(page.locator(".loading-text")).toBeVisible();

    // Result view
    const resultRegion = page.locator('.result-section[role="region"]');
    await expect(resultRegion).toBeVisible({ timeout: 10000 });

    // Route line
    await expect(page.locator(".route-line")).toContainText("LKO");
    await expect(page.locator(".route-line")).toContainText("NDLS");

    // Ledger items
    await expect(page.locator(".refund-ledger")).toContainText("Fare paid");
    await expect(page.locator(".refund-ledger")).toContainText("Cancellation deduction");
    await expect(page.locator(".refund-ledger")).toContainText("Estimated refund");

    // Positive refund amount in amber
    const totalRefund = page.locator(".refund-positive");
    await expect(totalRefund).toBeVisible();

    // Toggle calculation explanation
    const toggle = page.locator(".explanation-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator("#explanation-content")).toBeVisible();

    // Reset button resets to initial form
    await page.locator("button:has-text('Check another PNR')").click();
    await expect(page.locator("#pnr-input")).toBeVisible();
  });

  test("Flow 2: PNR ending in 1 (Confirmed Tatkal) renders zero refund in rust", async ({ page }) => {
    await page.locator("#pnr-input").fill("1234567891");
    await page.locator('button[type="submit"]').click();

    const resultRegion = page.locator('.result-section[role="region"]');
    await expect(resultRegion).toBeVisible({ timeout: 10000 });

    // Tatkal zero refund
    const zeroRefund = page.locator(".refund-zero");
    await expect(zeroRefund).toBeVisible();
    await expect(zeroRefund).toHaveText("₹0");
  });

  test("Flow 3: PNR ending in 2 (Fully Waitlisted post-chart) renders full refund", async ({ page }) => {
    await page.locator("#pnr-input").fill("1234567892");
    await page.locator('button[type="submit"]').click();

    const resultRegion = page.locator('.result-section[role="region"]');
    await expect(resultRegion).toBeVisible({ timeout: 10000 });

    // Full refund of ₹2,930
    const totalRefund = page.locator(".refund-positive");
    await expect(totalRefund).toContainText("₹2,930");
  });

  test("Flow 4: PNR ending in 3 (Mixed Passengers) renders UNSUPPORTED state with no rupee amount", async ({ page }) => {
    await page.locator("#pnr-input").fill("1234567893");
    await page.locator('button[type="submit"]').click();

    const unsupportedCard = page.locator(".unsupported-card");
    await expect(unsupportedCard).toBeVisible({ timeout: 10000 });
    await expect(unsupportedCard).toContainText(
      "We couldn't confidently calculate your refund for this ticket."
    );

    // Hard Rule: NEVER render any rupee amount on UNSUPPORTED state (not even ₹0)
    await expect(page.locator(".refund-ledger")).toHaveCount(0);
    await expect(unsupportedCard).not.toContainText("₹");
  });
});
