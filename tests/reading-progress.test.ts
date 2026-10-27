import { describe, it, expect } from "vitest";
import { readings } from "../src/data";
import {
  readingHistory,
  readingSummary,
  type ReadingVisitPayload,
} from "../src/lib/reading";
import { project, type LearningEvent } from "../src/lib/model";
import { validateBackup } from "../src/lib/import";
import {
  LearningDB,
  persist,
  synchronize,
  type Transport,
} from "../src/lib/store";

function visit(
  extra: Partial<ReadingVisitPayload> = {},
  at = "2026-10-27T03:00:00Z",
): LearningEvent {
  const lesson = readings[0];
  return {
    id: crypto.randomUUID(),
    scope: "alice",
    kind: "entry",
    at,
    entryId: `reading-progress:${lesson.id}`,
    payload: {
      activity: "reading-progress",
      version: lesson.version,
      lessonId: lesson.id,
      questionId: "q1",
      reachedEnd: false,
      ...extra,
    },
    synced: 0,
  };
}
describe("automatic reading state", () => {
  it("keeps a reached passage end even after subsequent navigation without inventing completed answers", () => {
    const first = visit({ reachedEnd: true });
    const later = visit({ questionId: "q3" }, "2026-10-27T04:00:00Z");
    const history = readingHistory([later, first], readings);
    expect(history[0].reachedEnd).toBe(true);
    expect(history[0].questionId).toBe("q3");
    expect(history[0].answered).toBe(0);
    expect(history[0].complete).toBe(false);
    expect(readingSummary([first, later], readings).answered).toBe(0);
    const state = project([first, later]);
    expect(state.readingVisits).toHaveLength(2);
    expect(state.entries).toEqual({});
    expect(state.progress).toEqual({});
  });
  it("recognises previously completed answers without a new visit record and never resets them on a new visit", () => {
    const answers = readings[0].questions.map((q, i): LearningEvent => ({
      id: crypto.randomUUID(),
      scope: "alice",
      kind: "review",
      at: `2026-10-27T02:00:0${i}Z`,
      entryId: `reading:${readings[0].id}:${q.id}`,
      payload: {
        activity: "reading",
        version: 1,
        lessonId: readings[0].id,
        questionId: q.id,
        questionType: q.type,
        answer: q.type === "choice" ? q.correct! : "A saved explanation.",
        rating: 3,
        assessment: q.type === "choice" ? "objective" : "self",
      },
      synced: 1,
    }));
    expect(readingHistory(answers, readings)[0].complete).toBe(true);
    const restored = validateBackup([...answers, visit()], "alice", true);
    expect(readingHistory(restored, readings)[0].complete).toBe(true);
    expect(readingSummary(restored, readings).complete).toBe(1);
  });
  it("rejects malformed progress identifiers and versions when importing", () => {
    const row = visit();
    for (const bad of [
      { ...row, entryId: "personal-wrong" },
      { ...row, payload: { ...row.payload, version: "1" } },
      { ...row, payload: { ...row.payload, reachedEnd: "true" } },
    ])
      expect(() => validateBackup([bad], "alice", true)).toThrow(
        "Invalid reading progress",
      );
  });
  it("syncs navigation and read status to another device under the existing schema", async () => {
    const a = new LearningDB("visit-a-" + crypto.randomUUID()),
      b = new LearningDB("visit-b-" + crypto.randomUUID());
    try {
      const row = visit({ reachedEnd: true, questionId: "q2" });
      await persist(row, a);
      const remote = new Map<string, LearningEvent>();
      const transport: Transport = {
        async upload(rows) {
          for (const e of rows) remote.set(e.id, e);
        },
        async download() {
          return [...remote.values()];
        },
      };
      await synchronize("alice", transport, a);
      await synchronize("alice", transport, b);
      const restored = await b.events.where("scope").equals("alice").toArray();
      expect(readingHistory(restored, readings)[0].reachedEnd).toBe(true);
      expect(readingHistory(restored, readings)[0].questionId).toBe("q2");
      expect(await b.events.where("scope").equals("bob").count()).toBe(0);
    } finally {
      await a.delete();
      await b.delete();
    }
  });
});
