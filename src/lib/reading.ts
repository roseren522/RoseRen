import type { LearningEvent, Source } from "./model";
export type ReadingTopic =
  | "Atmospheric processes"
  | "Environmental chemistry"
  | "Emissions & inventories"
  | "Data & evaluation"
  | "Uncertainty & inference"
  | "Climate & energy"
  | "Ecology & biodiversity"
  | "Research methods";
export const readingTopics: ReadingTopic[] = [
  "Atmospheric processes",
  "Environmental chemistry",
  "Emissions & inventories",
  "Data & evaluation",
  "Uncertainty & inference",
  "Climate & energy",
  "Ecology & biodiversity",
  "Research methods",
];
export interface ReadingChoice {
  id: string;
  text: string;
  explanation: string;
}
export interface ReadingQuestion {
  id: string;
  type: "choice" | "short";
  skill: string;
  prompt: string;
  paragraphs: number[];
  choices?: ReadingChoice[];
  correct?: string;
  explanation: string;
  modelAnswer?: string;
  rubric?: string[];
}
export interface ReadingLesson {
  id: string;
  version: number;
  title: string;
  subtitle: string;
  topic: ReadingTopic;
  level: "Intermediate" | "Advanced";
  sourceId: string;
  location: string;
  sourceAnchor?: string;
  paragraphs: string[];
  takeaway: string;
  terms: { term: string; definition: string }[];
  questions: ReadingQuestion[];
  evidenceType: "adaptation" | "abstract";
  publishedAt?: string;
  addedAt?: string;
}
export interface ReadingPayload extends Record<string, unknown> {
  activity: "reading";
  version: number;
  lessonId: string;
  questionId: string;
  questionType: "choice" | "short";
  answer: string;
  rating: 1 | 2 | 3 | 4;
  assessment: "objective" | "self";
  rubricChecks?: number[];
}
export interface ReadingVisitPayload extends Record<string, unknown> {
  activity: "reading-progress";
  version: number;
  lessonId: string;
  questionId: string;
  reachedEnd: boolean;
}
export function validateReadingVisit(event: LearningEvent) {
  const p = event.payload;
  if (
    event.kind !== "entry" ||
    event.entryId !== `reading-progress:${p.lessonId}` ||
    p.activity !== "reading-progress" ||
    !Number.isInteger(p.version) ||
    Number(p.version) < 1 ||
    typeof p.lessonId !== "string" ||
    !p.lessonId ||
    p.lessonId.length > 100 ||
    typeof p.questionId !== "string" ||
    !p.questionId ||
    p.questionId.length > 100 ||
    typeof p.reachedEnd !== "boolean"
  )
    throw new Error("Invalid reading progress record");
}
export function readingHistory(
  events: LearningEvent[],
  lessons: ReadingLesson[],
) {
  return lessons
    .map((lesson) => {
      const records = readingAnswers(events, lesson);
      const visits = events.filter(
        (e) =>
          e.kind === "entry" &&
          e.payload.activity === "reading-progress" &&
          e.payload.lessonId === lesson.id &&
          e.payload.version === lesson.version &&
          lesson.questions.some((q) => q.id === e.payload.questionId),
      );
      const activity = [...visits, ...Object.values(records)].sort(
        (a, b) =>
          Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id),
      );
      const latest = activity[0];
      return {
        lesson,
        latest,
        answered: Object.keys(records).length,
        complete: Object.keys(records).length === lesson.questions.length,
        reachedEnd: visits.some((e) => e.payload.reachedEnd === true),
        questionId: latest ? String(latest.payload.questionId) : undefined,
      };
    })
    .filter((item) => item.latest)
    .sort(
      (a, b) =>
        Date.parse(b.latest.at) - Date.parse(a.latest.at) ||
        b.latest.id.localeCompare(a.latest.id),
    );
}
export function isReadingEvent(event: LearningEvent) {
  return event.kind === "review" && event.payload.activity === "reading";
}
export function readingAnswers(events: LearningEvent[], lesson: ReadingLesson) {
  const answers: Record<string, LearningEvent> = {};
  for (const event of [...events].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id),
  )) {
    const p = event.payload;
    if (
      isReadingEvent(event) &&
      p.lessonId === lesson.id &&
      p.version === lesson.version &&
      lesson.questions.some((q) => q.id === p.questionId)
    )
      answers[String(p.questionId)] = event;
  }
  return answers;
}
export function readingSummary(
  events: LearningEvent[],
  lessons: ReadingLesson[],
) {
  let answered = 0,
    complete = 0,
    choiceCorrect = 0,
    choiceCount = 0;
  for (const lesson of lessons) {
    const records = readingAnswers(events, lesson);
    const values = Object.values(records);
    answered += values.length;
    if (values.length === lesson.questions.length) complete++;
    for (const e of values)
      if (e.payload.assessment === "objective") {
        choiceCount++;
        if (e.payload.rating === 3) choiceCorrect++;
      }
  }
  return { answered, complete, choiceCorrect, choiceCount };
}
export function validateReadingPayload(
  payload: Record<string, unknown>,
  entryId?: string,
) {
  if (payload.activity !== "reading") return;
  if (
    typeof payload.lessonId !== "string" ||
    !payload.lessonId ||
    payload.lessonId.length > 100 ||
    typeof payload.questionId !== "string" ||
    !payload.questionId ||
    payload.questionId.length > 100 ||
    !Number.isInteger(payload.version) ||
    Number(payload.version) < 1 ||
    entryId !== `reading:${payload.lessonId}:${payload.questionId}` ||
    typeof payload.answer !== "string" ||
    !payload.answer.trim() ||
    payload.answer.length > 8000 ||
    !["choice", "short"].includes(String(payload.questionType)) ||
    !["objective", "self"].includes(String(payload.assessment)) ||
    ![1, 2, 3, 4].includes(Number(payload.rating))
  )
    throw new Error("Invalid reading answer record");
  if (
    payload.questionType === "choice" &&
    (payload.assessment !== "objective" ||
      ![1, 3].includes(Number(payload.rating)))
  )
    throw new Error("Invalid choice assessment");
  if (payload.questionType === "short" && payload.assessment !== "self")
    throw new Error("Short answers require self-assessment");
  if (
    payload.rubricChecks !== undefined &&
    (!Array.isArray(payload.rubricChecks) ||
      payload.rubricChecks.length > 20 ||
      !payload.rubricChecks.every(
        (n) => Number.isInteger(n) && n >= 0 && n < 20,
      ))
  )
    throw new Error("Invalid self-assessment checklist");
}
export function readingSourceLink(lesson: ReadingLesson, source: Source) {
  return source.url + (lesson.sourceAnchor || "");
}
