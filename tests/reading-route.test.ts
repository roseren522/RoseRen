import { expect, it } from "vitest";
import { readings } from "../src/data";
import { readReadingRoute, readingHash } from "../src/lib/readingRoute";
it("encodes the exact article and question for reload and browser history", () => {
  const item = readings[0];
  expect(
    readReadingRoute(readingHash(item.id, item.questions[1].id), readings),
  ).toEqual({ lessonId: item.id, questionIndex: 1 });
});
it("falls back safely for unknown articles, malformed encodings and obsolete question IDs", () => {
  expect(readReadingRoute("#reading", readings)).toBeNull();
  expect(readReadingRoute("#reading/%E0%A4%A/q1", readings)).toBeNull();
  expect(readReadingRoute("#reading/not-a-lesson/q1", readings)).toBeNull();
  expect(
    readReadingRoute(readingHash(readings[0].id, "old-question"), readings)
      ?.questionIndex,
  ).toBe(0);
});
