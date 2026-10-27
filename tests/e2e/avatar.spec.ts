import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function openEditor(page: Page) {
  await page.getByRole("button", { name: "账号与登录", exact: true }).click();
  await page.getByRole("button", { name: /设置头像/ }).click();
  await expect(
    page.getByRole("dialog", { name: "设置头像", exact: true }),
  ).toBeVisible();
}

test("preset selection is explicit, persists across refresh and tabs, and can be removed", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await openEditor(page);
  await page.getByRole("button", { name: "选择海浪头像", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator(".top-avatar .avatar-waves")).toHaveCount(0);
  await openEditor(page);
  await page.getByRole("button", { name: "选择海浪头像", exact: true }).click();
  const issues = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    issues.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "保存头像", exact: true }).dblclick();
  await expect(page.locator(".top-avatar .avatar-waves")).toBeVisible();
  await page.reload();
  await expect(page.locator(".top-avatar .avatar-waves")).toBeVisible();
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator(".top-avatar .avatar-waves")).toBeVisible();
  await openEditor(page);
  await page.getByRole("button", { name: "恢复默认头像", exact: true }).click();
  await page.getByRole("button", { name: "保存头像", exact: true }).click();
  await expect(second.locator(".top-avatar .avatar-waves")).toHaveCount(0);
  await expect(second.locator(".top-avatar")).toHaveText("R");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("uploaded photo is cropped and compressed locally and invalid uploads preserve the selection", async ({
  page,
}) => {
  await page.goto("/");
  await openEditor(page);
  await page.getByRole("button", { name: "选择树苗头像", exact: true }).click();
  await page
    .getByLabel("上传头像图片", { exact: true })
    .setInputFiles({
      name: "invalid.png",
      mimeType: "image/png",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    });
  await expect(page.locator(".avatar-editor [role=alert]")).toContainText(
    "无法读取",
  );
  await expect(
    page.getByRole("button", { name: "选择树苗头像" }),
  ).toHaveAttribute("aria-pressed", "true");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 320;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#3b654f";
    ctx.fillRect(0, 0, 480, 320);
    ctx.fillStyle = "#e6e0c9";
    ctx.fillRect(160, 80, 160, 160);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("上传头像图片", { exact: true })
    .setInputFiles({
      name: "profile.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(page.locator(".avatar-editor-preview img")).toBeVisible();
  const photo = await page
    .locator(".avatar-editor-preview img")
    .evaluate((e: HTMLImageElement) => ({
      width: e.naturalWidth,
      height: e.naturalHeight,
      src: e.src,
    }));
  expect(photo.width).toBe(256);
  expect(photo.height).toBe(256);
  expect(photo.src.startsWith("data:image/jpeg;base64,")).toBe(true);
  expect(photo.src.length).toBeLessThanOrEqual(65536);
  await page.getByRole("button", { name: "保存头像", exact: true }).click();
  await expect(page.locator(".top-avatar img")).toHaveAttribute(
    "src",
    photo.src,
  );
  await page.reload();
  await expect(page.locator(".top-avatar img")).toHaveAttribute(
    "src",
    photo.src,
  );
});

test("failed avatar writes remain editable and can be retried", async ({
  page,
}) => {
  await page.goto("/");
  await openEditor(page);
  await page.getByRole("button", { name: "选择原子头像", exact: true }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    (
      window as unknown as { restoreAvatarStore: () => void }
    ).restoreAvatarStore = () => {
      IDBObjectStore.prototype.add = original;
    };
    IDBObjectStore.prototype.add = function (value, key) {
      if (value?.payload?.activity === "profile")
        throw new DOMException("Test write failure", "QuotaExceededError");
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    };
  });
  await page.getByRole("button", { name: "保存头像", exact: true }).click();
  await expect(page.locator(".avatar-editor [role=alert]")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "选择原子头像" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() =>
    (
      window as unknown as { restoreAvatarStore: () => void }
    ).restoreAvatarStore(),
  );
  await page.getByRole("button", { name: "保存头像", exact: true }).click();
  await expect(page.locator(".top-avatar .avatar-atom")).toBeVisible();
});
