import { expect, it } from "vitest";
import { readings, seed, sources } from "../src/data";
import {
  selectedVocabularyTerm,
  readingVocabularyEntry,
  matchingVocabulary,
} from "../src/lib/readingVocabulary";
import { makeChoices, project, type LearningEvent } from "../src/lib/model";
import { validateBackup } from "../src/lib/import";
import {
  LearningDB,
  persist,
  synchronize,
  type Transport,
} from "../src/lib/store";

const lesson = readings[0],
  source = sources.find((s) => s.id === lesson.sourceId)!;
const anchor = (
  term: string,
  blockId = "paragraph:0",
  text = lesson.paragraphs[0],
) => {
  const start = text.indexOf(term);
  return [{ blockId, start, end: start + term.length, quote: term }];
};

it("accepts a short phrase and captures its exact passage context and source, not a fabricated definition", () => {
  const entry = readingVocabularyEntry(
    anchor("specified volume"),
    lesson,
    source,
  )!;
  expect(entry.term).toBe("specified volume");
  expect(entry.meaning).toBe("");
  expect(entry.example).toBe(lesson.paragraphs[0]);
  expect(entry.exampleKind).toBe("reading");
  expect(entry.location).toContain("Paragraph 1");
  expect(entry.reference).toContain(source.url);
  expect(entry.verification).toBe("personal");
  expect(
    readingVocabularyEntry(
      [{ ...anchor("specified volume")[0], quote: "Fabricated" }],
      lesson,
      source,
    ),
  ).toBeNull();
  expect(
    readingVocabularyEntry(
      [{ ...anchor("specified volume")[0], start: -1 }],
      lesson,
      source,
    ),
  ).toBeNull();
  expect(
    selectedVocabularyTerm([
      ...anchor("specified volume"),
      ...anchor("material"),
    ]),
  ).toBeNull();
  expect(selectedVocabularyTerm(anchor(lesson.paragraphs[0]))).toBeNull();
  expect(
    selectedVocabularyTerm(anchor("<script>alert(1)</script>")),
  ).toBeNull();
});

it("captures a question without changing answers and uses maintained lesson definitions only for exact matches", () => {
  const question = lesson.questions[0];
  const entry = readingVocabularyEntry(
    anchor("distinction", "question:q1:prompt", question.prompt),
    lesson,
    source,
  )!;
  expect(entry.example).toBe(question.prompt);
  expect(entry.location).toContain("Question q1");
  const defined = readingVocabularyEntry(
    anchor("emissions inventory"),
    lesson,
    source,
  )!;
  expect(defined.meaning).toBe(
    lesson.terms.find((t) => t.term === "emissions inventory")!.definition,
  );
  expect(matchingVocabulary("  EMISSIONS  ", seed)?.term).toBe("emissions");
  expect(matchingVocabulary("specified volume", seed)).toBeUndefined();
  const target = seed.find((entry) => entry.contentLanguage === "en")!;
  expect(
    makeChoices(target, [target, entry]).map((choice) => choice.id),
  ).not.toContain(entry.id);
});

it("retains personal reading words, context and favorites through backup and cross-device sync with account isolation", async () => {
  const a = new LearningDB("reading-words-a-" + crypto.randomUUID());
  const b = new LearningDB("reading-words-b-" + crypto.randomUUID());
  try {
    const entry = readingVocabularyEntry(
      anchor("specified volume"),
      lesson,
      source,
    )!;
    const rows: LearningEvent[] = [
      {
        id: crypto.randomUUID(),
        scope: "alice",
        kind: "entry",
        entryId: entry.id,
        at: "2026-10-28T04:00:00Z",
        synced: 0,
        payload: { entry },
      },
      {
        id: crypto.randomUUID(),
        scope: "alice",
        kind: "favorite",
        entryId: entry.id,
        at: "2026-10-28T04:00:01Z",
        synced: 0,
        payload: { value: true },
      },
    ];
    const restored = project(
      validateBackup(structuredClone(rows), "alice", true),
    );
    expect(restored.entries[entry.id]).toEqual(entry);
    expect(restored.favorites.has(entry.id)).toBe(true);
    const remote = new Map<string, LearningEvent>();
    const transport: Transport = {
      async upload(events) {
        for (const event of events) remote.set(event.id, event);
      },
      async download() {
        return [...remote.values()];
      },
    };
    for (const row of rows) {
      await persist(row, a);
      await persist(row, a);
    }
    await synchronize("alice", transport, a);
    await synchronize("alice", transport, b);
    await synchronize("alice", transport, b);
    const state = project(
      await b.events.where("scope").equals("alice").toArray(),
    );
    expect(state.entries[entry.id]).toEqual(entry);
    expect(state.favorites.has(entry.id)).toBe(true);
    expect(await b.events.where("scope").equals("bob").count()).toBe(0);
    expect(await b.events.count()).toBe(2);
    expect(state.reviews).toHaveLength(0);
  } finally {
    await a.delete();
    await b.delete();
  }
});
