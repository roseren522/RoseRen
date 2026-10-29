import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fixture from "../fixtures/daily-literature.json" with { type: "json" };

test("daily article provenance, practice and new vocabulary work with an isolated fixture", async ({
  page,
}) => {
  // Only the test browser sees this invented article. Production data stays empty
  // until a real licensed source has passed the daily importer.
  await page.route(/\/src\/data\/daily-literature\.json(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export default ${JSON.stringify(fixture)};`,
    }),
  );
  await page.goto("/#reading");
  await expect(
    page.getByText("1 articles added", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Last successful search:/)).toBeVisible();
  await page
    .getByRole("button", { name: "Latest literature", exact: true })
    .click();
  await expect(page.locator(".reading-card")).toHaveCount(1);
  const issues = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(issues.violations.map((v) => v.id)).toEqual([]);
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await expect(
    page.getByText("Open-access abstract · verbatim source text", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".reading-text > p")).toHaveCount(2);
  await page.locator(".reading-source summary").click();
  await expect(page.locator(".reading-source")).toContainText("Alex Tester");
  await expect(page.locator(".reading-source")).toContainText(
    "has not reviewed the full paper",
  );
  await expect(
    page.getByRole("link", { name: "CC BY 4.0 · reuse license" }),
  ).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
  const question = fixture.articles[0].lesson.questions[0];
  const choice = question.choices!.find((c) => c.id === question.correct)!;
  await page
    .locator(".reading-options label")
    .filter({ hasText: choice.text })
    .getByRole("radio")
    .check();
  await page
    .getByRole("button", { name: "Check & save answer", exact: true })
    .click();
  await expect(
    page.getByText("Correct — now check the reasoning.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "All passages", exact: true }).click();
  await expect(
    page.locator(".reading-overview").getByText("1", { exact: true }),
  ).toBeVisible();
  await page.goto("/#vocabulary");
  await page
    .getByRole("textbox", { name: "搜索词汇书" })
    .fill(fixture.vocabulary[0].term);
  await expect(
    page
      .locator(".word-row .word-title")
      .getByText(fixture.vocabulary[0].term, { exact: true }),
  ).toBeVisible();
});

test("daily section reports pending first search honestly", async ({
  page,
}) => {
  await page.route(/\/src\/data\/daily-literature\.json(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "export default {schemaVersion:1,lastCheckedAt:null,lastAddedAt:null,articles:[],vocabulary:[],history:[]};",
    }),
  );
  await page.goto("/#reading");
  await expect(
    page.getByText("Awaiting the first successful automated search.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Latest literature", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "New literature will appear here." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("today's successful search with no additions does not look like an unrun schedule", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-29T07:00:00Z"));
  const data = { ...fixture, lastCheckedAt: "2026-10-29T05:42:16Z" };
  await page.route(/\/src\/data\/daily-literature\.json(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export default ${JSON.stringify(data)};`,
    }),
  );
  await page.goto("/#reading");
  await expect(page.locator(".daily-search-today")).toContainText(
    "Search completed today · 0 new articles · 0 new words",
  );
  await expect(
    page.getByText("Latest addition: 2026-10-27", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/No eligible unseen papers were added/),
  ).toBeVisible();
  await expect(page.getByText(/12:37 and 20:47 China time/)).toBeVisible();
});
