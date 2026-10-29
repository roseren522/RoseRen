import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function openPassage(page: Page, fresh = true) {
  if (!fresh) {
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Emissions are not concentrations",
        exact: true,
      }),
    ).toBeVisible();
    return;
  }
  await page.goto("/#reading");
  await page
    .locator(".reading-card")
    .filter({ hasText: "Emissions are not concentrations" })
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
}
async function select(
  page: Page,
  startBlock: string,
  start: number,
  end: number,
  endBlock = startBlock,
) {
  return page.evaluate(
    ({ startBlock, start, end, endBlock }) => {
      const from = document.querySelector<HTMLElement>(
        `[data-highlight-block="${startBlock}"]`,
      )!;
      const to = document.querySelector<HTMLElement>(
        `[data-highlight-block="${endBlock}"]`,
      )!;
      const boundary = (block: HTMLElement, offset: number): [Node, number] => {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const length = node.textContent!.length;
          if (offset <= length) return [node, offset];
          offset -= length;
        }
        throw new Error("Selection offset outside text");
      };
      const range = document.createRange();
      range.setStart(...boundary(from, start));
      range.setEnd(...boundary(to, end));
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      const rect = range.getClientRects()[0];
      return {
        x: rect.left + Math.min(rect.width / 2, 20),
        y: rect.top + rect.height / 2,
      };
    },
    { startBlock, start, end, endBlock },
  );
}
async function highlight(
  page: Page,
  block: string,
  start: number,
  end: number,
  endBlock = block,
) {
  await page
    .locator(`[data-highlight-block="${block}"]`)
    .scrollIntoViewIfNeeded();
  const point = await select(page, block, start, end, endBlock);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page
    .getByRole("menuitem", { name: "Highlight selection", exact: true })
    .click();
  await expect(page.locator(".reading-highlight-receipt")).toHaveText(
    "Highlight saved on this device.",
  );
}

test("right-click highlights passage and question text, survives refresh and removes a saved mark", async ({
  page,
}) => {
  await openPassage(page);
  await highlight(page, "paragraph:0", 3, 22);
  await expect(
    page.locator('[data-highlight-block="paragraph:0"] mark'),
  ).toHaveText("emissions inventory");
  await expect(
    page.locator('[data-highlight-block="paragraph:0"] mark'),
  ).toHaveAttribute("translate", "no");
  await expect(
    page.locator('[data-highlight-block="paragraph:0"] mark'),
  ).toHaveClass(/imt-notranslate/);
  await expect(page.locator('meta[name="google"]')).toHaveAttribute(
    "content",
    "notranslate",
  );
  // Simulate the actual plugin's translation target, leaving original text intact.
  await page.evaluate(() => {
    const node = document.createElement("font");
    node.className = "immersive-translate-target-wrapper";
    node.textContent = "这是翻译插件插入的译文。";
    document.querySelector(".reading-text > p")!.append(node);
  });
  await expect(
    page.locator(".immersive-translate-target-wrapper"),
  ).toBeHidden();
  await expect(
    page.locator('[data-highlight-block="paragraph:0"]'),
  ).toContainText("An emissions inventory describes material");
  await highlight(page, "question:q1:prompt", 5, 16);
  await expect(
    page.locator('[data-highlight-block="question:q1:prompt"] mark'),
  ).toHaveText("distinction");
  await highlight(page, "question:q1:choice:a", 0, 9);
  await expect(
    page.locator('.reading-options input[value="a"]'),
  ).not.toBeChecked();
  await expect(
    page.locator('[data-highlight-block="question:q1:choice:a"] mark'),
  ).toHaveText("Emissions");
  await openPassage(page, false);
  await expect(
    page.locator('[data-highlight-block="paragraph:0"] mark'),
  ).toHaveText("emissions inventory");
  await expect(
    page.locator('[data-highlight-block="question:q1:prompt"] mark'),
  ).toHaveText("distinction");
  await page
    .locator('[data-highlight-block="paragraph:0"] mark')
    .click({ button: "right" });
  const issues = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    issues.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page
    .getByRole("menuitem", { name: "Remove highlight", exact: true })
    .click();
  await expect(
    page.locator('[data-highlight-block="paragraph:0"] mark'),
  ).toHaveCount(0);
  await openPassage(page, false);
  await expect(
    page.locator('[data-highlight-block="paragraph:0"] mark'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-highlight-block="question:q1:prompt"] mark'),
  ).toHaveText("distinction");
});

test("overlapping and multi-paragraph selections preserve source text and can be removed", async ({
  page,
}) => {
  await openPassage(page);
  const block = page.locator('[data-highlight-block="paragraph:0"]');
  const original = await block.textContent();
  await highlight(page, "paragraph:0", 3, 22);
  await highlight(page, "paragraph:0", 13, 32);
  await expect(block).toHaveText(original!);
  await block
    .locator('mark[data-highlight-ids*=","]')
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Remove highlight", exact: true })
    .click();
  await expect(block.locator("mark")).toHaveCount(0);
  await highlight(
    page,
    "paragraph:0",
    original!.length - 25,
    24,
    "paragraph:1",
  );
  await expect(page.locator(".reading-text mark")).toHaveCount(2);
  await expect(block).toHaveText(original!);
});

test("mobile selection toolbar and keyboard context menu offer an equivalent highlight action", async ({
  page,
  isMobile,
}) => {
  await openPassage(page);
  await page
    .locator('[data-highlight-block="paragraph:0"]')
    .scrollIntoViewIfNeeded();
  await select(page, "paragraph:0", 3, 22);
  if (isMobile)
    await page
      .getByRole("button", { name: "Highlight selection", exact: true })
      .click();
  else {
    await page.keyboard.press("Shift+F10");
    await expect(
      page.getByRole("menu", { name: "Text highlight menu" }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
  }
  await expect(
    page.locator('[data-highlight-block="paragraph:0"] mark'),
  ).toHaveText("emissions inventory");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await select(page, "paragraph:0", 3, 22);
  if (isMobile)
    await page
      .getByRole("button", { name: "Remove highlight", exact: true })
      .click();
  else {
    await page.keyboard.press("Shift+F10");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
  }
  await expect(
    page.locator('[data-highlight-block="paragraph:0"] mark'),
  ).toHaveCount(0);
});

test("a failed highlight write leaves the text untouched and retries the same operation", async ({
  page,
}) => {
  await openPassage(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    (
      window as unknown as { restoreHighlightStore: () => void }
    ).restoreHighlightStore = () => {
      IDBObjectStore.prototype.add = original;
    };
    IDBObjectStore.prototype.add = function (value, key) {
      if (value?.payload?.activity === "reading-highlight")
        throw new DOMException("Test write failure", "QuotaExceededError");
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    };
  });
  await page
    .locator('[data-highlight-block="question:q1:prompt"]')
    .scrollIntoViewIfNeeded();
  const point = await select(page, "question:q1:prompt", 5, 16);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page
    .getByRole("menuitem", { name: "Highlight selection", exact: true })
    .click();
  await expect(
    page.locator(".reading-highlight-receipt[role=alert]"),
  ).toContainText("could not be saved");
  await expect(
    page.locator('[data-highlight-block="question:q1:prompt"] mark'),
  ).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as unknown as { restoreHighlightStore: () => void }
    ).restoreHighlightStore(),
  );
  await page
    .locator(".reading-highlight-receipt")
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await expect(
    page.locator('[data-highlight-block="question:q1:prompt"] mark'),
  ).toHaveText("distinction");
});
