import { expect, it } from "vitest";
import { literatureStatus } from "../src/lib/literatureStatus";
import type { DailyCatalog } from "../src/data";
import fixture from "./fixtures/daily-literature.json";

it("distinguishes today's successful zero-addition search from yesterday's additions", () => {
  const data = {
    ...fixture,
    lastCheckedAt: "2026-10-29T05:42:16Z",
  } as unknown as DailyCatalog;
  expect(literatureStatus(data, new Date("2026-10-29T07:00:00Z"))).toEqual({
    checkedToday: true,
    articlesAddedToday: 0,
    vocabularyAddedToday: 0,
  });
  expect(data.lastAddedAt).toBe(fixture.lastAddedAt);
});
it("uses Beijing days for daily article and vocabulary counts, independent of the device timezone", () => {
  const data = structuredClone(fixture) as unknown as DailyCatalog;
  data.lastCheckedAt = "2026-10-28T16:30:00Z";
  data.articles[0].addedAt = "2026-10-28T16:15:00Z";
  expect(literatureStatus(data, new Date("2026-10-28T17:00:00Z"))).toEqual({
    checkedToday: true,
    articlesAddedToday: 1,
    vocabularyAddedToday: fixture.vocabulary.length,
  });
  expect(
    literatureStatus(data, new Date("2026-10-29T16:00:00Z")).checkedToday,
  ).toBe(false);
  data.lastCheckedAt = null;
  expect(literatureStatus(data).checkedToday).toBe(false);
});
