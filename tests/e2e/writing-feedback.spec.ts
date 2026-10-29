import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import lessons from "../../src/data/readings.json" with { type: "json" };
const lesson = lessons[0],
  question = lesson.questions.find((q) => q.type === "short")!;
async function openWriting(page: Page) {
  await page.goto(`/#reading/${lesson.id}/${question.id}`);
  await expect(page.getByLabel("Your explanation, in English")).toBeVisible();
}
async function answerCount(page: Page) {
  return page.evaluate(async () => {
    return await new Promise<number>((resolve, reject) => {
      const req = indexedDB.open("fieldnotes-v1");
      req.onsuccess = () => {
        const get = req.result
          .transaction("events")
          .objectStore("events")
          .getAll();
        get.onsuccess = () =>
          resolve(
            get.result.filter(
              (e: { payload: { assessment?: string } }) =>
                e.payload.assessment === "reference",
            ).length,
          );
        get.onerror = () => reject(get.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
}
test("automatic reference feedback saves once, survives refresh and supports revising the same answer", async ({
  page,
}) => {
  await openWriting(page);
  const brief = "Transport can influence concentrations.";
  await page.getByLabel("Your explanation, in English").fill(brief);
  const checkBox = await page
    .getByRole("button", { name: "Check my answer", exact: true })
    .boundingBox();
  const compareBox = await page
    .getByRole("button", { name: "Compare with reference points", exact: true })
    .boundingBox();
  expect(Math.abs(checkBox!.height - compareBox!.height)).toBeLessThan(1);
  if (Math.abs(checkBox!.y - compareBox!.y) < 1) {
    expect(
      compareBox!.x - (checkBox!.x + checkBox!.width),
    ).toBeGreaterThanOrEqual(11);
  } else {
    expect(Math.abs(checkBox!.x - compareBox!.x)).toBeLessThan(1);
    expect(Math.abs(checkBox!.width - compareBox!.width)).toBeLessThan(1);
    expect(
      compareBox!.y - (checkBox!.y + checkBox!.height),
    ).toBeGreaterThanOrEqual(11);
  }
  await page
    .getByRole("button", { name: "Check my answer", exact: true })
    .dblclick();
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toBeVisible();
  await expect(page.locator(".writing-feedback")).toContainText("To improve:");
  await expect(page.locator(".writing-feedback-saved")).toContainText(
    "saved on this device",
  );
  expect(await answerCount(page)).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your explanation, in English")).toHaveValue(
    brief,
  );
  await page
    .getByRole("button", { name: "Revise answer", exact: true })
    .click();
  await expect(page.getByLabel("Your explanation, in English")).toHaveValue(
    brief,
  );
  await page
    .getByLabel("Your explanation, in English")
    .fill(question.modelAnswer!);
  await page
    .getByRole("button", { name: "Check my answer", exact: true })
    .click();
  await expect(page.locator(".writing-feedback-heading")).toContainText(
    "3 of 3 reference points detected",
  );
  expect(await answerCount(page)).toBe(2);
  const issues = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    issues.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "All passages", exact: true }).click();
  await expect(
    page.locator(".reading-overview").getByText("1", { exact: true }),
  ).toBeVisible();
});

test("failed feedback writes keep the response and retry without duplicate records", async ({
  page,
}) => {
  await openWriting(page);
  await page
    .getByLabel("Your explanation, in English")
    .fill(question.modelAnswer!);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    (
      window as unknown as { restoreFeedbackStore: () => void }
    ).restoreFeedbackStore = () => {
      IDBObjectStore.prototype.add = original;
    };
    IDBObjectStore.prototype.add = function (value, key) {
      if (value?.payload?.assessment === "reference")
        throw new DOMException("Test failure", "QuotaExceededError");
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    };
  });
  await page
    .getByRole("button", { name: "Check my answer", exact: true })
    .click();
  await expect(page.locator(".writing-feedback-saved")).toContainText(
    "Save has not succeeded",
  );
  await expect(page.getByLabel("Your explanation, in English")).toHaveValue(
    question.modelAnswer!,
  );
  expect(await answerCount(page)).toBe(0);
  await page.evaluate(() =>
    (
      window as unknown as { restoreFeedbackStore: () => void }
    ).restoreFeedbackStore(),
  );
  await page
    .getByRole("button", { name: "Retry check & save", exact: true })
    .click();
  await expect(page.locator(".writing-feedback-saved")).toContainText(
    "saved on this device",
  );
  expect(await answerCount(page)).toBe(1);
});

test("new daily abstracts receive a clearly labelled source checklist", async ({
  page,
}) => {
  const fixture = await import("../fixtures/daily-literature.json", {
    with: { type: "json" },
  });
  await page.route(/\/src\/data\/daily-literature\.json(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export default ${JSON.stringify(fixture.default)};`,
    }),
  );
  const item = fixture.default.articles[0];
  await page.goto(`/#reading/${item.lesson.id}/q3`);
  await page
    .getByLabel("Your explanation, in English")
    .fill(
      "This study examines biodiversity and ecosystem services. Species richness differed across locations. The observed association does not establish causation and further research is needed.",
    );
  await page
    .getByRole("button", { name: "Check my answer", exact: true })
    .click();
  await expect(page.locator(".writing-feedback")).toContainText(
    "general source-based checklist",
  );
  await expect(page.locator(".writing-feedback-saved")).toContainText(
    "saved on this device",
  );
});
