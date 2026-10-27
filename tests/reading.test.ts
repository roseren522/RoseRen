import { describe, it, expect } from "vitest";
import Dexie from "dexie";
import { readings, seed, sources } from "../src/data";
import {
  readingAnswers,
  readingSummary,
  validateReadingPayload,
  type ReadingPayload,
} from "../src/lib/reading";
import {
  project,
  statistics,
  makeChoices,
  type LearningEvent,
} from "../src/lib/model";
import { validateBackup } from "../src/lib/import";
import {
  LearningDB,
  persist,
  synchronize,
  type Transport,
} from "../src/lib/store";
function readingEvent(
  questionIndex = 0,
  extra: Partial<ReadingPayload> = {},
): LearningEvent {
  const lesson = readings[0],
    question = lesson.questions[questionIndex];
  return {
    id: crypto.randomUUID(),
    scope: "alice",
    kind: "review",
    at: "2026-10-26T02:00:00.000Z",
    entryId: `reading:${lesson.id}:${question.id}`,
    payload: {
      activity: "reading",
      version: 1,
      lessonId: lesson.id,
      questionId: question.id,
      questionType: question.type,
      answer:
        question.type === "choice"
          ? question.correct!
          : "Transport and chemistry both affect concentrations.",
      rating: 3,
      assessment: question.type === "choice" ? "objective" : "self",
      ...extra,
    },
    synced: 0,
  };
}
describe("English reading content", () => {
  it("contains 12 sourced adaptations with 24 unambiguous choices and 12 reference-based written prompts", () => {
    expect(
      readings.filter((l) => l.evidenceType === "adaptation"),
    ).toHaveLength(12);
    expect(new Set(readings.map((l) => l.id)).size).toBe(readings.length);
    for (const lesson of readings) {
      expect(sources.some((s) => s.id === lesson.sourceId)).toBe(true);
      expect(["adaptation", "abstract"]).toContain(lesson.evidenceType);
      expect(lesson.questions.filter((q) => q.type === "choice")).toHaveLength(
        2,
      );
      expect(lesson.questions.filter((q) => q.type === "short")).toHaveLength(
        1,
      );
      expect(lesson.paragraphs.length).toBeGreaterThan(0);
      for (const question of lesson.questions) {
        expect(
          question.paragraphs.every(
            (n) => n >= 1 && n <= lesson.paragraphs.length,
          ),
        ).toBe(true);
        expect(question.prompt).not.toMatch(/[\u3400-\u9fff]/);
        if (question.type === "choice") {
          expect(question.choices).toHaveLength(4);
          expect(
            question.choices!.filter((c) => c.id === question.correct),
          ).toHaveLength(1);
          expect(new Set(question.choices!.map((c) => c.text)).size).toBe(4);
          expect(question.choices!.every((c) => c.explanation)).toBe(true);
        } else {
          expect(question.rubric?.length).toBeGreaterThanOrEqual(3);
          expect(question.modelAnswer).toBeTruthy();
        }
      }
    }
  });
  it("adds 60 English vocabulary entries and keeps distractors in the same definition language", () => {
    const added = seed.filter((e) => e.id.startsWith("en-"));
    expect(added).toHaveLength(60);
    for (const entry of added) {
      expect(entry.meaning + entry.explanation + entry.example).not.toMatch(
        /[\u3400-\u9fff]/,
      );
      expect(
        makeChoices(entry, seed).every((e) => e.contentLanguage === "en"),
      ).toBe(true);
    }
  });
});
describe("reading records and account-safe persistence", () => {
  it("keeps reading separate from vocabulary scheduling while contributing to real daily activity", () => {
    const event = readingEvent();
    const state = project([event, event]);
    state.timezone = "Asia/Shanghai";
    expect(state.readingReviews).toHaveLength(1);
    expect(state.reviews).toHaveLength(0);
    expect(state.progress).toEqual({});
    const stats = statistics(state, new Date(event.at));
    expect(stats.fresh).toBe(0);
    expect(stats.learned).toBe(0);
    expect(stats.reading).toBe(1);
    expect(stats.streak).toBe(1);
  });
  it("reports latest answers per question without counting retries as extra completed questions", () => {
    const a = readingEvent(0, { rating: 1 }),
      b = { ...readingEvent(), at: "2026-10-26T03:00:00Z" },
      c = readingEvent(1),
      d = readingEvent(2);
    expect(readingAnswers([b, a], readings[0]).q1.id).toBe(b.id);
    expect(readingSummary([a, b, c, d], readings)).toEqual({
      answered: 3,
      complete: 1,
      choiceCorrect: 2,
      choiceCount: 2,
    });
    expect(
      readingSummary([readingEvent(0, { version: 2 })], readings).answered,
    ).toBe(0);
  });
  it("validates restored answers and rejects mismatched IDs or fabricated automatic written grades", () => {
    const event = readingEvent(2);
    expect(validateBackup([event], "alice", true)[0].synced).toBe(0);
    expect(() =>
      validateReadingPayload(
        { ...event.payload, assessment: "objective" },
        event.entryId,
      ),
    ).toThrow("self-assessment");
    expect(() => validateReadingPayload(event.payload, "v001")).toThrow();
    expect(() =>
      validateReadingPayload({ ...event.payload, answer: "" }, event.entryId),
    ).toThrow();
  });
  it("syncs reading answers idempotently to a second device with the existing review event schema", async () => {
    const a = new LearningDB("reading-a-" + crypto.randomUUID()),
      b = new LearningDB("reading-b-" + crypto.randomUUID());
    try {
      const event = readingEvent(2);
      await Promise.all([persist(event, a), persist(event, a)]);
      const server = new Map<string, LearningEvent>();
      const transport: Transport = {
        async upload(rows) {
          for (const row of rows) server.set(row.id, row);
        },
        async download() {
          return [...server.values()];
        },
      };
      await synchronize("alice", transport, a);
      await synchronize("alice", transport, b);
      expect(server.size).toBe(1);
      const remote = await b.events.where("scope").equals("alice").toArray();
      expect(readingSummary(remote, readings).answered).toBe(1);
      expect(remote[0].payload.answer).toBe(event.payload.answer);
      expect(await b.events.where("scope").equals("bob").count()).toBe(0);
    } finally {
      await a.delete();
      await b.delete();
    }
  });
  it("upgrades an existing vocabulary database without losing events and isolates local drafts by account", async () => {
    const name = "reading-upgrade-" + crypto.randomUUID(),
      legacy = new Dexie(name);
    legacy.version(1).stores({ events: "id, scope, [scope+synced]" });
    await legacy.table("events").add(readingEvent());
    legacy.close();
    const next = new LearningDB(name);
    try {
      expect(await next.events.count()).toBe(1);
      await next.drafts.put({
        scope: "alice",
        key: "lesson:q3",
        answer: "A persisted explanation.",
        updatedAt: new Date().toISOString(),
      });
      expect((await next.drafts.get(["alice", "lesson:q3"]))?.answer).toBe(
        "A persisted explanation.",
      );
      expect(await next.drafts.get(["bob", "lesson:q3"])).toBeUndefined();
    } finally {
      await next.delete();
    }
  });
});
