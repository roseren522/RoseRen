import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lessons from "../../src/data/readings.json" with { type: "json" };

const lesson = lessons[0];
test("a fully completed reading survives closing the entire browser and reappears on the homepage", async ({}, info) => {
  const profile = await mkdtemp(join(tmpdir(), "fieldnotes-reading-"));
  const options = {
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
    viewport: {
      width: info.project.name === "mobile" ? 390 : 1440,
      height: 950,
    },
  };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    let page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/#reading");
    await page
      .locator(".reading-card")
      .filter({ hasText: lesson.title })
      .getByRole("button", { name: "Start reading", exact: true })
      .click();
    for (const question of lesson.questions.slice(0, 2)) {
      await page
        .locator(`.reading-options input[value="${question.correct}"]`)
        .check();
      await page
        .getByRole("button", { name: "Check & save answer", exact: true })
        .click();
      await expect(
        page.getByText("Correct — now check the reasoning.", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Next question", exact: true })
        .click();
    }
    const explanation =
      "Emissions add material, while transport, chemical reactions and removal also influence concentrations. A monitoring site does not measure a direct copy of local source releases.";
    await page.getByLabel("Your explanation, in English").fill(explanation);
    await page
      .getByRole("button", {
        name: "Compare with reference points",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Well supported", exact: true })
      .click();
    await expect(
      page.getByText("Passage practice complete", { exact: true }),
    ).toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/");
    await expect(page.locator(".reading-dashboard-link")).toContainText(
      "已完成 1 篇练习 · 已保存 3 道回答",
    );
    await page.locator(".reading-dashboard-link").click();
    await expect(page.locator(".reading-resume")).toContainText(
      "3 / 3 answers saved · Practice complete",
    );
    await page.getByRole("button", { name: "My history", exact: true }).click();
    await expect(page.locator(".reading-card")).toHaveCount(1);
    await expect(page.locator(".reading-card .reading-state")).toContainText(
      "Practice complete",
    );
    await page
      .getByRole("button", { name: "Review passage", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Written response", exact: true })
      .click();
    await expect(page.getByLabel("Your explanation, in English")).toHaveValue(
      explanation,
    );
    await expect(
      page.getByLabel("Your explanation, in English"),
    ).toBeDisabled();
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("reading the passage and an unchecked choice save automatically and resume at the same question", async ({
  page,
}) => {
  await page.goto("/#reading");
  await page
    .locator(".reading-card")
    .filter({ hasText: lesson.title })
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await page.getByRole("button", { name: /Question 2/ }).click();
  await page.locator('.reading-options input[value="c"]').check();
  await expect(page.getByText(/Choice saved on this device/)).toBeVisible();
  await page.locator(".reading-end-marker").scrollIntoViewIfNeeded();
  await expect(page.locator(".reading-position-note")).toContainText(
    "Passage end reached",
  );
  await page.reload();
  await expect(page.locator(".reading-resume")).toContainText(
    "Passage read · practice in progress",
  );
  await page
    .getByRole("button", { name: "Resume reading", exact: true })
    .click();
  await expect(page.locator('.reading-options input[value="c"]')).toBeChecked();
  await expect(
    page.getByRole("button", { name: /Question 2/ }),
  ).toHaveAttribute("aria-current", "step");
  await expect(
    page.getByRole("button", { name: "Check & save answer", exact: true }),
  ).toBeVisible();
});
