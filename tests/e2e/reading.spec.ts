import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("English reading choices save once, show evidence and restore after refresh", async ({
  page,
  context,
}) => {
  await page.goto("/#reading");
  await expect(
    page.getByRole("heading", { name: "Go beyond the word." }),
  ).toBeVisible();
  expect(await page.locator(".reading-lab").innerText()).not.toMatch(
    /[\u3400-\u9fff]/,
  );
  await page
    .locator(".reading-card")
    .filter({ hasText: "Emissions are not concentrations" })
    .getByRole("button", { name: "Start reading" })
    .click();
  await expect(
    page.getByText("Source-based learning adaptation · not a quotation"),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: /Emissions describe releases/ })
    .check();
  await page.getByRole("button", { name: "Check & save answer" }).dblclick();
  await expect(
    page.getByText("Correct — now check the reasoning."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Highlight supporting paragraphs/ })
    .click();
  await expect(page.locator(".evidence-active")).toHaveCount(2);
  const count = await page.evaluate(async () => {
    const req = indexedDB.open("fieldnotes-v1");
    return new Promise<number>((resolve, reject) => {
      req.onsuccess = () => {
        const get = req.result
          .transaction("events")
          .objectStore("events")
          .getAll();
        get.onsuccess = () =>
          resolve(
            get.result.filter(
              (e: { payload: { activity?: string } }) =>
                e.payload.activity === "reading",
            ).length,
          );
      };
      req.onerror = () => reject(req.error);
    });
  });
  expect(count).toBe(1);
  await page.reload();
  await expect(
    page.locator(".reading-overview").getByText("1", { exact: true }),
  ).toBeVisible();
  const second = await context.newPage();
  await second.goto("/#reading");
  await expect(
    second.locator(".reading-overview").getByText("1", { exact: true }),
  ).toBeVisible();
  await second
    .locator(".reading-card")
    .filter({ hasText: "Emissions are not concentrations" })
    .getByRole("button", { name: "Continue reading" })
    .click();
  await expect(
    second.getByRole("heading", {
      name: "Concentration falls at a monitoring site. Which conclusion is supported?",
    }),
  ).toBeVisible();
});
test("written draft survives refresh; reference-based self assessment saves without automatic grading", async ({
  page,
}) => {
  await page.goto("/#reading");
  await page
    .locator(".reading-card")
    .first()
    .getByRole("button", { name: "Start reading" })
    .click();
  await page.getByRole("button", { name: /Written response/ }).click();
  const text =
    "Transport and chemical reactions can affect concentrations even when local emissions change. Boundary conditions and meteorology must also be considered.";
  await page.getByLabel("Your explanation, in English").fill(text);
  await expect(
    page.getByText("Draft saved on this device.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page
    .locator(".reading-card")
    .first()
    .getByRole("button", { name: "Start reading" })
    .click();
  await page.getByRole("button", { name: /Written response/ }).click();
  await expect(page.getByLabel("Your explanation, in English")).toHaveValue(
    text,
  );
  await page
    .getByRole("button", { name: "Compare with reference points" })
    .click();
  await expect(
    page.getByText("REFERENCE ANSWER · ONE POSSIBLE EXPLANATION"),
  ).toBeVisible();
  await expect(
    page.getByText(/not an automated correctness score/),
  ).toBeVisible();
  await page.getByRole("checkbox").first().check();
  await page
    .getByRole("button", { name: "Well supported", exact: true })
    .click();
  await expect(
    page.getByText("Self-assessment:", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Your explanation, in English")).toBeDisabled();
  await page.reload();
  await page
    .locator(".reading-card")
    .first()
    .getByRole("button", { name: "Continue reading" })
    .click();
  await page.getByRole("button", { name: /Written response/ }).click();
  await expect(page.getByLabel("Your explanation, in English")).toHaveValue(
    text,
  );
  await expect(
    page.getByText("Self-assessment:", { exact: false }),
  ).toBeVisible();
});
test("topic filtering, PDF source links, mobile layout and English learning content work", async ({
  page,
}) => {
  await page.goto("/#reading");
  const libraryIssues = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    libraryIssues.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page
    .getByLabel("Reading topic", { exact: true })
    .selectOption("Uncertainty & inference");
  await expect(page.locator(".reading-card")).toHaveCount(4);
  await page
    .locator(".reading-card")
    .filter({ hasText: "What Monte Carlo actually propagates" })
    .getByRole("button", { name: "Start reading" })
    .click();
  await page
    .getByText("Source & verification details", { exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open the inspected source" }),
  ).toHaveAttribute("href", /www\.ipcc-nggip\.iges\.or\.jp.*#page=33$/);
  expect(await page.locator(".reading-lab").innerText()).not.toMatch(
    /[\u3400-\u9fff]/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const issues = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    issues.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});
test("production reading supports offline draft recovery and completed answers", async ({
  page,
  context,
}) => {
  await page.goto("http://127.0.0.1:5175/#reading");
  await expect(
    page.getByRole("heading", { name: "Go beyond the word." }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  await page
    .locator(".reading-card")
    .first()
    .getByRole("button", { name: "Start reading" })
    .click();
  await page.getByRole("button", { name: /Written response/ }).click();
  const text =
    "The measured concentration also depends on transport, chemical transformations and removal, not only the amount emitted.";
  await page.getByLabel("Your explanation, in English").fill(text);
  await expect(
    page.getByText("Draft saved on this device.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page
    .locator(".reading-card")
    .first()
    .getByRole("button", { name: "Start reading" })
    .click();
  await page.getByRole("button", { name: /Written response/ }).click();
  await expect(page.getByLabel("Your explanation, in English")).toHaveValue(
    text,
  );
  await page
    .getByRole("button", { name: "Compare with reference points" })
    .click();
  await page.getByRole("button", { name: "Partly there", exact: true }).click();
  await expect(page.locator(".reading-save-receipt")).toContainText(
    "Saved on this device",
  );
  await context.setOffline(false);
});
