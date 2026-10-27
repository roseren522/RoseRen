import { describe, expect, it } from "vitest";
import { readings } from "../src/data";
import {
  checkWritingAnswer,
  feedbackRating,
  validWritingFeedback,
} from "../src/lib/writingFeedback";
import { validateReadingPayload, readingSummary } from "../src/lib/reading";
import { validateBackup } from "../src/lib/import";
import {
  LearningDB,
  persist,
  synchronize,
  type Transport,
} from "../src/lib/store";
import type { LearningEvent } from "../src/lib/model";

const lesson = readings[0],
  question = lesson.questions.find((q) => q.type === "short")!;
describe("English reference-point feedback", () => {
  it("detects the maintained reference points in all twelve authored model answers", () => {
    for (const item of readings.filter(
      (l) => l.evidenceType === "adaptation",
    )) {
      const q = item.questions.find((q) => q.type === "short")!;
      const report = checkWritingAnswer(q.modelAnswer!, item, q);
      expect(
        report.detected,
        item.id + ": " + JSON.stringify(report.points.map((p) => p.status)),
      ).toBe(3);
      expect(report.kind).toBe("curated");
      expect(validWritingFeedback(report)).toBe(true);
    }
  });
  it("recognises common paraphrases while distinguishing incomplete explanations and keyword lists", () => {
    const paraphrase =
      "Local releases and ambient concentration are different. Advection and wet deposition also influence the measurements. You cannot assume an equal percentage response.";
    expect(checkWritingAnswer(paraphrase, lesson, question).detected).toBe(3);
    const brief = checkWritingAnswer(
      "Transport can influence concentrations.",
      lesson,
      question,
    );
    expect(brief.detected).toBeLessThan(3);
    expect(brief.points.some((p) => p.status === "partial")).toBe(true);
    const list = checkWritingAnswer(
      "emissions concentrations transport chemistry not proportional",
      lesson,
      question,
    );
    expect(list.detected).toBe(0);
    expect(list.notes.join(" ")).toContain("list of keywords");
    expect(
      checkWritingAnswer(
        "The transportation policy is important.",
        lesson,
        question,
      ).points[1].matched,
    ).toEqual([]);
  });
  it("flags explicit contradictory cue combinations rather than awarding coverage for their keywords", () => {
    const report = checkWritingAnswer(
      "Emissions and concentrations are distinct. Transport and chemistry do not affect concentrations. Emission cuts must always cause equal concentration reductions.",
      lesson,
      question,
    );
    expect(report.points[1].status).toBe("review");
    expect(report.points[2].status).toBe("review");
    expect(report.detected).toBeLessThan(3);
    expect(
      checkWritingAnswer(
        "We should not claim transport and chemistry do not affect concentrations.",
        lesson,
        question,
      ).points[1].status,
    ).not.toBe("review");
    for (const point of report.points)
      for (const evidence of point.evidence)
        expect(
          "Emissions and concentrations are distinct. Transport and chemistry do not affect concentrations. Emission cuts must always cause equal concentration reductions.",
        ).toContain(evidence);
  });
  it("uses a source-labelled general checklist for new daily articles and offers limited language notes", () => {
    const daily = {
      ...lesson,
      id: "literature-new-paper",
      title: "Seagrass recovery and biodiversity",
      terms: [{ term: "seagrass", definition: "A marine flowering plant." }],
      paragraphs: [
        "This study investigates seagrass recovery and biodiversity.",
        "Seagrass cover increased by 20% at the sampled sites. Future research should test other sites.",
      ],
    };
    const report = checkWritingAnswer(
      "we examine seagrass recovery. The the results is promising but causation is not established",
      daily,
      question,
    );
    expect(report.kind).toBe("source-checklist");
    expect(report.points).toHaveLength(3);
    expect(report.notes.join(" ")).toContain("capital letter");
    expect(report.notes.join(" ")).toContain("repeated");
    expect(report.notes.join(" ")).toContain("agreement");
    expect(
      checkWritingAnswer(
        "No limitations are reported in this abstract.",
        daily,
        question,
      ).points[2].status,
    ).not.toBe("review");
  });
  it("validates saved feedback, rejects fabricated evidence and preserves old manual assessments", () => {
    const answer = question.modelAnswer!,
      report = checkWritingAnswer(answer, lesson, question);
    const row: LearningEvent = {
      id: crypto.randomUUID(),
      scope: "alice",
      kind: "review",
      at: "2026-10-27T07:00:00Z",
      entryId: `reading:${lesson.id}:${question.id}`,
      synced: 0,
      payload: {
        activity: "reading",
        version: 1,
        lessonId: lesson.id,
        questionId: question.id,
        questionType: "short",
        answer,
        rating: feedbackRating(report),
        assessment: "reference",
        feedback: report,
      },
    };
    expect(validateBackup([row], "alice", true)[0].payload.feedback).toEqual(
      report,
    );
    expect(readingSummary([row], readings).answered).toBe(1);
    expect(readingSummary([row], readings).choiceCount).toBe(0);
    expect(() =>
      validateReadingPayload({ ...row.payload, rating: 1 }, row.entryId),
    ).toThrow("feedback");
    const bad = structuredClone(report);
    bad.points[0].evidence = ["A fabricated quotation not in the response."];
    expect(() =>
      validateReadingPayload({ ...row.payload, feedback: bad }, row.entryId),
    ).toThrow("evidence");
    expect(() =>
      validateReadingPayload(
        { ...row.payload, assessment: "self", feedback: undefined },
        row.entryId,
      ),
    ).not.toThrow();
  });
  it("restores checked answers and their reports on another device using the existing cloud transport", async () => {
    const a = new LearningDB("feedback-a-" + crypto.randomUUID()),
      b = new LearningDB("feedback-b-" + crypto.randomUUID());
    try {
      const answer = question.modelAnswer!,
        report = checkWritingAnswer(answer, lesson, question);
      const row: LearningEvent = {
        id: crypto.randomUUID(),
        scope: "alice",
        kind: "review",
        at: "2026-10-27T07:00:00Z",
        entryId: `reading:${lesson.id}:${question.id}`,
        synced: 0,
        payload: {
          activity: "reading",
          version: 1,
          lessonId: lesson.id,
          questionId: question.id,
          questionType: "short",
          answer,
          rating: feedbackRating(report),
          assessment: "reference",
          feedback: report,
        },
      };
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
      expect(restored[0].payload.feedback).toEqual(report);
      expect(restored[0].payload.answer).toBe(answer);
      expect(await b.events.where("scope").equals("bob").count()).toBe(0);
    } finally {
      await a.delete();
      await b.delete();
    }
  });
});
