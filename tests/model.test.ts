import { describe, it, expect } from "vitest";
import {
  project,
  statistics,
  acceptsAnswer,
  stage,
  dayKey,
  makeChoices,
  type LearningEvent,
} from "../src/lib/model";
import { seed, sources } from "../src/data";
const event = (id: string, at: string, rating: number): LearningEvent => ({
  id,
  at,
  kind: "review",
  scope: "guest",
  entryId: "v001",
  payload: { rating },
  synced: 1,
});
describe("FSRS scheduling and immutable replay", () => {
  it("schedules Again earlier than Good and Easy and does not master a new card", () => {
    const at = "2026-10-20T00:00:00Z";
    const again = project([event("a", at, 1)]),
      good = project([event("a", at, 3)]),
      easy = project([event("a", at, 4)]);
    expect(again.progress.v001.card.due.getTime()).toBeLessThan(
      good.progress.v001.card.due.getTime(),
    );
    expect(good.progress.v001.card.due.getTime()).toBeLessThan(
      easy.progress.v001.card.due.getTime(),
    );
    expect(stage(easy.progress.v001)).toBe("学习中");
  });
  it("deduplicates event IDs and converges regardless of arrival order", () => {
    const a = event("a", "2026-10-20T00:00:00.000Z", 1),
      b = event("b", "2026-10-21T00:00:00+00:00", 3),
      c = event("c", "2026-10-22T00:00:00Z", 4);
    expect(project([a, b, c]).progress).toEqual(project([c, a, b, a]).progress);
    expect(project([a, b, c, a]).reviews).toHaveLength(3);
    expect(project([a, b, c]).progress.v001.misses).toBe(1);
  });
  it("counts new words separately from subsequent reviews in the selected timezone", () => {
    const a = event("a", "2026-10-20T16:30:00Z", 1),
      b = event("b", "2026-10-20T17:00:00Z", 3);
    const state = project([
      a,
      b,
      {
        id: "tz",
        at: "2026-10-20T00:00:00Z",
        scope: "guest",
        kind: "timezone",
        payload: { value: "Asia/Shanghai" },
        synced: 1,
      },
    ]);
    const stats = statistics(state, new Date("2026-10-20T18:00:00Z"));
    expect(stats.today).toBe("2026-10-21");
    expect(stats.fresh).toBe(1);
    expect(stats.reviews).toBe(1);
    expect(stats.streak).toBe(1);
    expect(dayKey("2026-10-20T16:30:00Z", "America/New_York")).toBe(
      "2026-10-20",
    );
  });
  it("streaks use calendar dates across daylight-saving transitions", () => {
    const rows = [
      event("a", "2026-03-07T17:00:00Z", 3),
      event("b", "2026-03-08T16:00:00Z", 3),
      event("c", "2026-03-09T16:00:00Z", 3),
    ];
    const state = project(rows);
    state.timezone = "America/New_York";
    expect(statistics(state, new Date("2026-03-09T18:00:00Z")).streak).toBe(3);
  });
  it("preserves the most recent preference and personal deletion", () => {
    const a: LearningEvent = {
      id: "a",
      at: "2026-10-20T00:00:00Z",
      scope: "guest",
      kind: "target",
      payload: { value: 5 },
      synced: 1,
    };
    const b = {
      ...a,
      id: "b",
      at: "2026-10-21T00:00:00Z",
      payload: { value: 20 },
    };
    expect(project([b, a]).target).toBe(20);
  });
});
describe("answer handling and source integrity", () => {
  it("accepts capitalization, repeated spaces, and only declared variants", () => {
    expect(acceptsAnswer(seed[0], "  AMMONIA  ")).toBe(true);
    expect(acceptsAnswer(seed[0], "ammonium")).toBe(false);
    const e = seed.find((e) => e.term === "emissions inventories")!;
    expect(acceptsAnswer(e, " EMISSION   INVENTORY ")).toBe(true);
  });
  it("offers a single exact meaning and distinct distractors", () => {
    for (const entry of seed) {
      const choices = makeChoices(entry, seed);
      expect(choices).toHaveLength(4);
      expect(choices.filter((c) => c.meaning === entry.meaning)).toHaveLength(
        1,
      );
      expect(new Set(choices.map((c) => c.meaning)).size).toBe(4);
    }
  });
  it("has 120 verified entries with official pinned occurrence references and original examples", () => {
    expect(seed).toHaveLength(120);
    for (const e of seed) {
      expect(e.verification).toBe("verified");
      const source = sources.find((s) => s.id === e.sourceId);
      expect(source?.url).toContain("github.com/USEPA/CMAQ/blob/93099d");
      expect(e.location).toMatch(/L\d+$/);
      expect(e.evidence?.toLowerCase()).toContain(e.term.toLowerCase());
      expect(e.example).not.toBe(e.evidence);
    }
  });
});
