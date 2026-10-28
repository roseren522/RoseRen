import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import lessons from "../../src/data/readings.json" with { type: "json" };

async function selectWord(
  page: Page,
  term: string,
  mobile: boolean,
  blockId = "paragraph:0",
) {
  await page
    .locator(`[data-highlight-block="${blockId}"]`)
    .scrollIntoViewIfNeeded();
  const point = await page.evaluate(
    ({ term, blockId }) => {
      const block = document.querySelector<HTMLElement>(
        `[data-highlight-block="${blockId}"]`,
      )!;
      const start = block.textContent!.indexOf(term);
      if (start < 0) throw new Error("Word not found in block");
      const boundary = (offset: number): [Node, number] => {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (offset <= node.textContent!.length) return [node, offset];
          offset -= node.textContent!.length;
        }
        throw new Error("Selection offset outside block");
      };
      const range = document.createRange();
      range.setStart(...boundary(start));
      range.setEnd(...boundary(start + term.length));
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      const rect = range.getClientRects()[0];
      return {
        x: rect.left + Math.min(10, rect.width / 2),
        y: rect.top + rect.height / 2,
      };
    },
    { term, blockId },
  );
  if (mobile)
    await page
      .getByRole("group", { name: "Selected text actions" })
      .getByRole("button", { name: "Add to vocabulary", exact: true })
      .click();
  else {
    await page.mouse.click(point.x, point.y, { button: "right" });
    await page
      .getByRole("menuitem", { name: "Add to vocabulary", exact: true })
      .click();
  }
  await expect(
    page.getByRole("dialog", { name: "Save a reading word" }),
  ).toBeVisible();
}

async function readingEntries(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ id: string; term: string }[]>((resolve) => {
        const request = indexedDB.open("fieldnotes-v1");
        request.onsuccess = () => {
          const get = request.result
            .transaction("events")
            .objectStore("events")
            .getAll();
          get.onsuccess = () => {
            request.result.close();
            resolve(
              get.result
                .filter(
                  (e) =>
                    e.kind === "entry" &&
                    e.payload.entry?.exampleKind === "reading",
                )
                .map((e) => e.payload.entry),
            );
          };
        };
      }),
  );
}

test("save a new phrase offline, restore its reading context, then study and complete its definition", async ({
  page,
  context,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:5175/#reading/${lessons[0].id}/q1`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await selectWord(page, "specified volume", isMobile);
  await expect(page.getByLabel("Word or short phrase")).toHaveValue(
    "specified volume",
  );
  await expect(page.getByLabel("English definition (optional)")).toBeEmpty();
  const issues = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(issues.violations.map((issue) => issue.id)).toEqual([]);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to vocabulary", exact: true })
    .dblclick();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await readingEntries(page)).toHaveLength(1);
  await page.reload();
  await selectWord(page, "specified volume", isMobile);
  await expect(page.getByText(/Already in your vocabulary/)).toBeVisible();
  await page.getByRole("button", { name: "Save for later study" }).click();
  expect(await readingEntries(page)).toHaveLength(1);

  await page.goto("http://127.0.0.1:5175/#personal");
  await page.getByRole("button", { name: "学习我的词汇", exact: true }).click();
  await expect(page.locator(".flashcard-prompt h2")).toHaveText(
    "specified volume",
  );
  await expect(
    page.getByRole("button", { name: "选择", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "拼写", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /点击查看释义/ }).click();
  await expect(page.locator(".example-block")).toContainText(
    lessons[0].paragraphs[0],
  );
  await page
    .getByRole("button", { name: "查看词源与概念依据", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Paragraph 1");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page
    .getByLabel("English definition", { exact: false })
    .fill("A clearly defined amount of space.");
  await page.getByRole("button", { name: "保存词条", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "选择", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(false);
});

test("an existing word is favorited without a duplicate, and question text can be saved without selecting an answer", async ({
  page,
  isMobile,
}) => {
  await page.goto(`/#reading/${lessons[0].id}/q1`);
  await selectWord(page, "emissions", isMobile);
  await expect(page.getByText(/Already in your vocabulary/)).toBeVisible();
  await page.getByRole("button", { name: "Save for later study" }).click();
  expect(await readingEntries(page)).toHaveLength(0);
  await selectWord(page, "distinction", isMobile, "question:q1:prompt");
  await page
    .getByLabel("English definition (optional)")
    .fill("A difference between two things.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to vocabulary", exact: true })
    .click();
  await expect(page.locator(".reading-options input:checked")).toHaveCount(0);
  await page.goto("/#vocabulary");
  await page.getByRole("button", { name: "已收藏", exact: true }).click();
  await expect(page.locator(".word-row")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "学习收藏词汇", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "distinction term / phrase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    lessons[0].questions[0].prompt,
  );
  await expect(page.getByRole("dialog")).toContainText("Question q1");
});

test("a failed word save keeps the selected phrase and definition for retry", async ({
  page,
  isMobile,
}) => {
  await page.goto(`/#reading/${lessons[0].id}/q1`);
  await selectWord(page, "specified volume", isMobile);
  await page
    .getByLabel("English definition (optional)")
    .fill("A defined amount of space.");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    (window as unknown as { restoreWordStore: () => void }).restoreWordStore =
      () => {
        IDBObjectStore.prototype.add = original;
      };
    IDBObjectStore.prototype.add = function (value, key) {
      if (value?.payload?.entry?.exampleKind === "reading")
        throw new DOMException("Test failure", "QuotaExceededError");
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    };
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to vocabulary", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "could not be saved",
  );
  await expect(page.getByLabel("English definition (optional)")).toHaveValue(
    "A defined amount of space.",
  );
  expect(await readingEntries(page)).toHaveLength(0);
  await page.evaluate(() =>
    (window as unknown as { restoreWordStore: () => void }).restoreWordStore(),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to vocabulary", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await readingEntries(page)).toHaveLength(1);
});

test("retrying after the word saves but its favorite fails does not duplicate the word", async ({
  page,
  isMobile,
}) => {
  await page.goto(`/#reading/${lessons[0].id}/q1`);
  await selectWord(page, "specified volume", isMobile);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    (
      window as unknown as { restoreWordFavorite: () => void }
    ).restoreWordFavorite = () => {
      IDBObjectStore.prototype.add = original;
    };
    IDBObjectStore.prototype.add = function (value, key) {
      if (value?.kind === "favorite" && value.entryId?.startsWith("personal-"))
        throw new DOMException("Test favorite failure", "QuotaExceededError");
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    };
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add to vocabulary", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "could not be saved",
  );
  await expect(page.getByText(/Already in your vocabulary/)).toBeVisible();
  expect(await readingEntries(page)).toHaveLength(1);
  await page.evaluate(() =>
    (
      window as unknown as { restoreWordFavorite: () => void }
    ).restoreWordFavorite(),
  );
  await page
    .getByRole("button", { name: "Save for later study", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await readingEntries(page)).toHaveLength(1);
  await page.goto("/#vocabulary");
  await page.getByRole("button", { name: "已收藏", exact: true }).click();
  await expect(page.locator(".word-row")).toHaveCount(1);
});
