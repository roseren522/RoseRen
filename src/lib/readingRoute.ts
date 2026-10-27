import type { ReadingLesson } from "./reading";

export function readingHash(lessonId: string, questionId: string) {
  return `#reading/${encodeURIComponent(lessonId)}/${encodeURIComponent(questionId)}`;
}
export function readReadingRoute(hash: string, lessons: ReadingLesson[]) {
  const parts = hash.slice(1).split("/");
  if (parts[0] !== "reading" || !parts[1]) return null;
  try {
    const lesson = lessons.find((l) => l.id === decodeURIComponent(parts[1]));
    if (!lesson) return null;
    const question = decodeURIComponent(parts[2] || "");
    return {
      lessonId: lesson.id,
      questionIndex: Math.max(
        0,
        lesson.questions.findIndex((q) => q.id === question),
      ),
    };
  } catch {
    return null;
  }
}
