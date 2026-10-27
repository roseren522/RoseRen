import { test, expect } from "@playwright/test";

test("switching tabs, visiting another page and returning restores the article, question and draft", async ({
  page,
  context,
}) => {
  await page.goto("/#reading");
  await page
    .locator(".reading-card")
    .filter({ hasText: "Emissions are not concentrations" })
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await page.getByRole("button", { name: /Question 2/ }).click();
  await page.locator('.reading-options input[value="c"]').check();
  await expect(page.getByText(/Choice saved on this device/)).toBeVisible();
  const readingURL = page.url();
  expect(readingURL).toContain("#reading/emissions-concentrations/q2");
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await page.bringToFront();
  await expect(
    page.getByRole("button", { name: /Question 2/ }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.locator('.reading-options input[value="c"]')).toBeChecked();
  await page.goto("about:blank");
  await page.goBack();
  await expect(page).toHaveURL(readingURL);
  await expect(page.locator('.reading-options input[value="c"]')).toBeChecked();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Emissions are not concentrations",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Question 2/ }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.locator('.reading-options input[value="c"]')).toBeChecked();
});

test("browser back and forward preserve explicit passage navigation without trapping question history", async ({
  page,
}) => {
  await page.goto("/#reading");
  await page
    .locator(".reading-card")
    .filter({ hasText: "Emissions are not concentrations" })
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await page.getByRole("button", { name: /Written response/ }).click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Go beyond the word.", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("Your explanation, in English")).toBeVisible();
  await expect(page).toHaveURL(/#reading\/emissions-concentrations\/q3$/);
  await page.getByRole("button", { name: "All passages", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Go beyond the word.", exact: true }),
  ).toBeVisible();
});
