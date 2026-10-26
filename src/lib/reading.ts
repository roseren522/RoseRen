import type { LearningEvent, Source } from "./model";
export type ReadingTopic =
  | "Atmospheric processes"
  | "Environmental chemistry"
  | "Emissions & inventories"
  | "Data & evaluation"
  | "Uncertainty & inference";
export const readingTopics: ReadingTopic[] = [
  "Atmospheric processes",
  "Environmental chemistry",
  "Emissions & inventories",
  "Data & evaluation",
  "Uncertainty & inference",
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
  evidenceType: "adaptation";
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
