import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
test("browser closure restores persisted learning from disk", async () => {
  const profile = await mkdtemp(join(tmpdir(), "fieldnotes-profile-"));
  const options = {
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  };
  try {
    let context = await chromium.launchPersistentContext(profile, options);
    let page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/");
    await page
      .getByRole("button", { name: "开始今日学习", exact: true })
      .click();
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: /4\s*Easy/ })).toBeVisible();
    await page.keyboard.press("4");
    await expect(
      page.getByRole("heading", { name: "ammonium", exact: true }),
    ).toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/");
    await expect(page.locator(".target-count strong")).toContainText("1");
    await page
      .getByRole("button", { name: "继续今日学习", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "ammonium", exact: true }),
    ).toBeVisible();
    await context.close();
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});
test("production PWA reloads offline and retains offline study actions", async ({
  page,
  context,
}) => {
  await page.goto("http://127.0.0.1:5175/");
  await expect(page.getByRole("heading", { name: /让研究英语/ })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await page.waitForLoadState("networkidle");
  await expect
    .poll(() => page.evaluate(async () => Boolean(await caches.match("/"))))
    .toBe(true);
  await context.setOffline(true);
  await page.getByRole("button", { name: "开始今日学习", exact: true }).click();
  await page.keyboard.press("Space");
  await page.keyboard.press("4");
  await expect(
    page.getByRole("heading", { name: "ammonium", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".target-count strong")).toContainText("1");
  await expect(page.getByText(/当前离线/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(false);
});
test("failed local save retains the current card for an explicit retry", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始今日学习", exact: true }).click();
  await page.keyboard.press("Space");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    (window as unknown as { failWrites: boolean }).failWrites = true;
    IDBObjectStore.prototype.add = function (value, key) {
      if (
        (window as unknown as { failWrites: boolean }).failWrites &&
        value.kind === "review"
      )
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      return original.call(this, value, key);
    };
  });
  await page.getByRole("button", { name: /3\s*Good/ }).click();
  await expect(
    page.getByRole("button", { name: "保存失败 · 重试" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ammonia", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { failWrites: boolean }).failWrites = false;
  });
  await page.getByRole("button", { name: /3\s*Good/ }).click();
  await expect(
    page.getByRole("heading", { name: "ammonium", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".target-count strong")).toContainText("1");
});
test("multiple choice reveals feedback and schedules with a rating", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始今日学习", exact: true }).click();
  await page.getByRole("button", { name: "选择", exact: true }).click();
  await expect(page.locator(".choices button")).toHaveCount(4);
  await page
    .locator(".choices button")
    .filter({ hasText: /^[ABCD]氨$/ })
    .click();
  await expect(page.getByText("理解正确，继续积累。")).toBeVisible();
  await page.getByRole("button", { name: /3\s*Good/ }).click();
  await expect(
    page.getByRole("heading", { name: "ammonium", exact: true }),
  ).toBeVisible();
});
test("dashboard and vocabulary pass automated WCAG A/AA checks", async ({
  page,
}) => {
  for (const route of ["/", "/#vocabulary"]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});
