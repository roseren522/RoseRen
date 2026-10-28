import { test, expect } from "@playwright/test";
import lessons from "../../src/data/readings.json" with { type: "json" };

// Daily papers sort above the original lessons. This is the penultimate
// passage in the library, where the user reported the desktop white screen.
const lesson = lessons.at(-2)!,
  question = lesson.questions.find((q) => q.type === "short")!,
  url = `http://127.0.0.1:5175/#reading/${lesson.id}/${question.id}`;

test.describe("production feedback without later script downloads", () => {
  test.use({ serviceWorkers: "block" });

  test("checking the penultimate passage stays visible when scripts are unavailable and restores the saved answer", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    const answer = page.getByLabel("Your explanation, in English");
    await answer.fill(question.modelAnswer!);

    // A previous deployment's optional chunks can disappear while an old
    // page is open. No script request after this point may be required to check.
    const laterScripts: string[] = [];
    await page.route("**/assets/**", (route) => {
      if (route.request().resourceType() === "script") {
        laterScripts.push(route.request().url());
        return route.abort("failed");
      }
      return route.continue();
    });
    await page
      .getByRole("button", { name: "Check my answer", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Answer feedback" }),
    ).toContainText("3 of 3 reference points detected");
    await expect(page.locator(".writing-feedback-saved")).toContainText(
      "saved on this device",
    );
    await expect(answer).toHaveValue(question.modelAnswer!);
    await expect(
      page.getByRole("button", { name: "All passages", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    expect(laterScripts).toEqual([]);

    await page.unrouteAll();
    await page.reload();
    await expect(page.getByLabel("Your explanation, in English")).toHaveValue(
      question.modelAnswer!,
    );
    await expect(
      page.getByRole("region", { name: "Answer feedback" }),
    ).toContainText("3 of 3 reference points detected");
    expect(errors).toEqual([]);
  });
});

test("an offline-shell update waits while the reading tab checks and restores answers offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await expect(page.getByLabel("Your explanation, in English")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const originalController = await page.evaluate(
    () => navigator.serviceWorker.controller!.scriptURL,
  );

  // A new script URL triggers the real update lifecycle without changing the
  // shared dist directory or disturbing another test's production server.
  await page.evaluate(() =>
    navigator.serviceWorker.register("/sw.js?rollover-test=1", { scope: "/" }),
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            (await navigator.serviceWorker.getRegistration())?.waiting?.state,
        ),
      { timeout: 10000 },
    )
    .toBe("installed");
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL),
  ).toBe(originalController);

  await context.setOffline(true);
  await page
    .getByLabel("Your explanation, in English")
    .fill(question.modelAnswer!);
  await page
    .getByRole("button", { name: "Check my answer", exact: true })
    .click();
  await expect(page.locator(".writing-feedback-saved")).toContainText(
    "saved on this device",
  );
  await page.reload();
  await expect(page.getByLabel("Your explanation, in English")).toHaveValue(
    question.modelAnswer!,
  );
  await expect(
    page.getByRole("region", { name: "Answer feedback" }),
  ).toContainText("3 of 3 reference points detected");
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
