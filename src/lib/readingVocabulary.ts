import type { TextAnchor } from "./highlights";
import type { Entry, Source } from "./model";
import { normalizeAnswer } from "./model";
import { readingSourceLink, type ReadingLesson } from "./reading";

export function selectedVocabularyTerm(ranges: TextAnchor[]) {
  if (ranges.length !== 1) return null;
  const term = ranges[0].quote
    .normalize("NFKC")
    .replace(/^[\s.,;:!?()[\]{}"“”‘’]+|[\s.,;:!?()[\]{}"“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return term.length > 0 &&
    term.length <= 150 &&
    term.split(" ").length <= 10 &&
    /[a-z]/i.test(term) &&
    /^[\p{L}\p{N}\s'’.,%+\-/–—−]+$/u.test(term)
    ? term
    : null;
}

export function matchingVocabulary(term: string, entries: Entry[]) {
  const key = normalizeAnswer(term);
  return entries.find((entry) =>
    [entry.term, ...entry.variants].some(
      (value) => normalizeAnswer(value) === key,
    ),
  );
}

export function readingVocabularyEntry(
  ranges: TextAnchor[],
  lesson: ReadingLesson,
  source: Source,
): Entry | null {
  const term = selectedVocabularyTerm(ranges);
  if (!term) return null;
  const anchor = ranges[0];
  let context: string | undefined;
  let location = "";
  const paragraph = /^paragraph:(\d+)$/.exec(anchor.blockId);
  if (paragraph) {
    context = lesson.paragraphs[Number(paragraph[1])];
    location = `Paragraph ${Number(paragraph[1]) + 1}`;
  } else {
    const match =
      /^question:([\w-]+):(prompt|reference|explanation|choice:([\w-]+))$/.exec(
        anchor.blockId,
      );
    const question = lesson.questions.find((q) => q.id === match?.[1]);
    if (match && question) {
      context =
        match[2] === "prompt"
          ? question.prompt
          : match[2] === "reference"
            ? question.modelAnswer
            : match[2] === "explanation"
              ? question.explanation
              : question.choices?.find((choice) => choice.id === match[3])
                  ?.text;
      location = `Question ${question.id} · ${match[2]}`;
    }
  }
  if (
    !context ||
    !Number.isInteger(anchor.start) ||
    !Number.isInteger(anchor.end) ||
    anchor.start < 0 ||
    anchor.end <= anchor.start ||
    anchor.end > context.length ||
    context.slice(anchor.start, anchor.end) !== anchor.quote
  )
    return null;
  const definition =
    lesson.terms.find(
      (item) => normalizeAnswer(item.term) === normalizeAnswer(term),
    )?.definition || "";
  return {
    id: "personal-" + crypto.randomUUID(),
    term,
    meaning: definition,
    explanation: definition,
    pos: "term / phrase",
    collocations: [],
    example: context,
    exampleKind: "reading",
    translation: "",
    topic: "学术表达",
    difficulty: "进阶",
    related: "",
    variants: [],
    verification: "personal",
    contentLanguage: "en",
    reference: readingSourceLink(lesson, source),
    location: `Reading Lab · ${lesson.title} · ${location}`,
    definitionNote: definition
      ? "Definition from this lesson's maintained English glossary; saved as a personal word."
      : "Definition pending. Saved reading context is not a dictionary definition.",
  };
}
