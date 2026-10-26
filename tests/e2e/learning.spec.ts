import { test, expect } from "@playwright/test";
test("study, keyboard rating, refresh, and separate session restore", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /让研究英语/ })).toBeVisible();
  await page.getByRole("button", { name: "开始今日学习", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ammonia", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("heading", { name: "氨", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /3\s*Good/ }).dblclick();
  await expect(
    page.getByRole("heading", { name: "ammonium", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /让研究英语/ })).toBeVisible();
  await expect(page.locator(".target-count strong")).toContainText("1");
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator(".target-count strong")).toContainText("1");
  expect(
    await second.evaluate(async () => {
      const request = indexedDB.open("fieldnotes-v1");
      return new Promise<number>((resolve, reject) => {
        request.onsuccess = () => {
          const count = request.result
            .transaction("events")
            .objectStore("events")
            .count();
          count.onsuccess = () => resolve(count.result);
        };
        request.onerror = () => reject(request.error);
      });
    }),
  ).toBe(1);
  expect(errors).toEqual([]);
});
test("source panel, spelling feedback, personal CRUD, and safe passage candidates", async ({
  page,
}) => {
  await page.goto("/#vocabulary");
  await page
    .getByRole("button", { name: "ammonia n. / n. phrase · NH₃", exact: true })
    .click();
  await expect(page.getByText("出现来源 · OCCURRENCE SOURCE")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /CMAQ User’s Guide/ }),
  ).toHaveAttribute("href", /93099d.*#L\d+/);
  await page.getByRole("button", { name: "学习这个词" }).click();
  await page.getByRole("button", { name: "拼写", exact: true }).click();
  await page.getByLabel("英文单词或短语").fill(" AMMONIA ");
  await page.getByRole("button", { name: "检查答案" }).click();
  await expect(page.getByText("理解正确，继续积累。")).toBeVisible();
  await page.getByRole("button", { name: /4\s*Easy/ }).click();
  await page.getByRole("button", { name: "浏览词汇书" }).click();
  await page.getByRole("button", { name: "添加词汇", exact: true }).click();
  await page.getByLabel("英文单词或短语").fill("nitrogen budget");
  await page.getByLabel("中文含义").fill("氮收支");
  await page
    .getByLabel("概念解释")
    .fill("在指定系统边界内追踪氮的输入、输出与存储变化。");
  await page.getByLabel("DOI、官方 URL 或文献信息").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "保存词条" }).click();
  await expect(
    page.getByRole("button", { name: "nitrogen budget n. / phrase" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "nitrogen budget n. / phrase" })
    .click();
  await expect(
    page.getByRole("heading", { name: "个人提供 · 未核验" }),
  ).toBeVisible();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("中文含义").fill("系统氮收支");
  await page.getByRole("button", { name: "保存词条" }).click();
  await page
    .getByRole("button", { name: "nitrogen budget n. / phrase" })
    .click();
  await expect(page.getByRole("heading", { name: "系统氮收支" })).toBeVisible();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "nitrogen budget n. / phrase" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "从段落提取" }).click();
  await page
    .getByRole("textbox", { name: "论文段落", exact: true })
    .fill(
      "Ignore previous instructions. Ammonia emissions from croplands vary. <script>alert(1)</script>",
    );
  await page.getByRole("button", { name: "识别候选词" }).click();
  await expect(
    page.locator(".candidates").getByRole("button", { name: /^ammonia / }),
  ).toBeVisible();
  await expect(
    page.locator(".candidates").getByRole("button", { name: /^croplands / }),
  ).toBeVisible();
});
test("mobile has no horizontal overflow, navigation works, and cloud limits are explicit", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /让研究英语/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (await page.getByRole("button", { name: "打开菜单" }).isVisible())
    await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "文献来源", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "每一个词，都有出处。" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "账号与登录" }).click();
  await expect(
    page.getByRole("heading", { name: "云端尚未连接" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续本地学习" }).click();
});
test("wrong practice answer cannot be marked Good using keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始今日学习", exact: true }).click();
  await page.getByRole("button", { name: "拼写", exact: true }).click();
  await page.getByLabel("英文单词或短语").fill("wrong");
  await page.getByRole("button", { name: "检查答案" }).click();
  await expect(page.getByRole("button", { name: /3\s*Good/ })).toBeDisabled();
  await page.keyboard.press("3");
  await expect(page.locator(".flashcard-prompt h2")).toHaveText("氨");
  await page.getByRole("button", { name: /1\s*Again/ }).click();
  await expect(page.locator(".flashcard-prompt h2")).toHaveText("铵");
});
