import configurations from "../data/writing-criteria.json";
import type { ReadingLesson, ReadingQuestion } from "./reading";

interface Criterion {
  groups: string[][];
  minimum?: number;
  guidance: string;
  conflicts?: string[];
}
export interface WritingFeedbackPoint {
  index: number;
  label: string;
  status: "detected" | "partial" | "missing" | "review";
  matched: string[];
  evidence: string[];
  suggestion: string;
}
export interface WritingFeedback {
  engineVersion: 1;
  criteriaVersion: 1;
  kind: "curated" | "source-checklist";
  detected: number;
  total: number;
  points: WritingFeedbackPoint[];
  notes: string[];
}
const irregular: Record<string, string> = {
  analyses: "analysis",
  species: "species",
  processes: "process",
  biases: "bias",
  gases: "gas",
  does: "do",
  did: "do",
  is: "be",
  are: "be",
  was: "be",
  were: "be",
  matched: "match",
  matching: "match",
  checked: "check",
  checking: "check",
  compared: "compare",
  comparing: "compare",
  affected: "affect",
  affecting: "affect",
  influenced: "influence",
  influencing: "influence",
  changed: "change",
  changing: "change",
  shared: "share",
  sharing: "share",
  justified: "justify",
  assessed: "assess",
  assessing: "assess",
  evaluated: "evaluate",
  evaluating: "evaluate",
  represented: "represent",
  representing: "represent",
  observed: "observe",
  observing: "observe",
  measured: "measure",
  measuring: "measure",
};
function normalized(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\b(can't|cannot)\b/g, "can not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\b(does|do|is|are|was|were|did)n['’]t\b/g, "$1 not")
    .replace(/[^a-z0-9%.'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function canonical(word: string) {
  word = word.replace(/[^a-z0-9%]/g, "");
  if (irregular[word]) return irregular[word];
  if (word.length > 5 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && word.endsWith("s") && !/(ss|sis|bias|gas)$/.test(word))
    return word.slice(0, -1);
  return word;
}
function tokens(text: string) {
  return normalized(text).split(" ").map(canonical).filter(Boolean);
}
function includesPhrase(sentence: string[], phrase: string) {
  const target = tokens(phrase);
  return (
    target.length > 0 &&
    sentence.some((_, i) => target.every((word, n) => sentence[i + n] === word))
  );
}
const stop = new Set(
  "a an the this that these those of in on for to and or with from by as at into during about between among through we our their its they it study studies result results finding findings method methods using used use show showed shown can could may might will would should be have has were are was is which also than not only more most each such both all over under after before based based respectively however therefore abstract reference evidence final paragraph verbatim complete identify question supporting detail compare against generated model essay".split(
    " ",
  ),
);
function contentTerms(text: string) {
  const words = text.match(/[A-Za-z][A-Za-z-]{3,}/g) || [];
  return [
    ...new Set(words.map((w) => w.toLowerCase()).filter((w) => !stop.has(w))),
  ];
}
function sourceChecklist(lesson: ReadingLesson): {
  labels: string[];
  criteria: Criterion[];
} {
  const context = [
    ...new Set([
      ...lesson.terms.map((t) => t.term),
      ...contentTerms(lesson.title),
    ]),
  ].slice(0, 14);
  const final = lesson.paragraphs.at(-1) || "";
  const evidence = [
    ...new Set([
      ...(final.match(/\b\d+(?:\.\d+)?%?\b/g) || []),
      ...contentTerms(final),
    ]),
  ].slice(0, 24);
  return {
    labels: [
      "Use source-specific research concepts.",
      "Include a concrete detail from the abstract.",
      "Qualify the interpretation or identify a limitation/unanswered question.",
    ],
    criteria: [
      {
        groups: context.map((t) => [t]),
        minimum: Math.min(2, context.length),
        guidance:
          "Name the actual system, exposure, process or population studied. Compare your summary with the opening of the abstract.",
      },
      {
        groups: evidence.map((t) => [t]),
        minimum: Math.min(2, evidence.length),
        guidance:
          "Support the summary with a specific result or detail stated in the abstract. Matching a word or number does not verify how you interpreted it.",
      },
      {
        groups: [
          [
            "limitation",
            "uncertain",
            "uncertainty",
            "unanswered",
            "not establish",
            "not prove",
            "not imply",
            "cannot conclude",
            "can not conclude",
            "not necessarily",
            "association",
            "causation",
            "only studied",
            "further research",
            "future work",
            "not reported",
            "not addressed",
            "does not report",
            "limited to",
          ],
        ],
        guidance:
          "State a reported limitation or clearly label your own unanswered question. Do not infer causation from association alone.",
        conflicts: [
          "(?:has|have|there are) no limitations?|without any limitations?",
          "association (?:proves|establishes) causation",
        ],
      },
    ],
  };
}
const verbs = new Set(
  "be have do can may might would should could will depend affect influence explain describe reflect combine cancel produce cause change check examine inspect define compare document represent include omit establish prove assume specify allow convert enter leave mean require remove justify assess evaluate relate vary support report observe measure need identify account distinguish indicate suggest consider provide contain use connect lead show reflect arise".split(
    " ",
  ),
);

/** A transparent lexical aid: matched cues are not a scientific correctness grade. */
export function checkWritingAnswer(
  answer: string,
  lesson: ReadingLesson,
  question: ReadingQuestion,
): WritingFeedback {
  if (question.type !== "short" || !answer.trim() || answer.length > 8000)
    throw new Error("Enter an English response before checking it.");
  const configured = Object.hasOwn(configurations, lesson.id)
    ? (configurations as Record<string, Criterion[]>)[lesson.id]
    : undefined;
  const fallback = sourceChecklist(lesson);
  const criteria = configured || fallback.criteria;
  const labels = configured ? question.rubric || [] : fallback.labels;
  const sentences = answer
    .trim()
    .split(/(?<=[.!?])\s+|\n+/)
    .filter(Boolean);
  const wordList = tokens(answer);
  const hasClause = wordList.some((w) => verbs.has(w));
  const notes: string[] = [];
  if (!hasClause)
    notes.push(
      "Use complete English sentences and explain the relationship between ideas; a list of keywords is not enough.",
    );
  if (wordList.length < 18)
    notes.push(
      "Your response is brief. Check whether you have explained the reasoning and supplied supporting detail.",
    );
  if (/^[a-z]/.test(answer.trim()))
    notes.push("Start the first sentence with a capital letter.");
  if (!/[.!?][\s"')]*$/.test(answer.trim()))
    notes.push("End full sentences with appropriate punctuation.");
  if (/\b(the|and|is|are|to|of|a)\s+\1\b/i.test(answer))
    notes.push("Check for an accidentally repeated function word.");
  if (/\b(?:emissions|concentrations|results|factors) is\b/i.test(answer))
    notes.push(
      "Check subject–verb agreement: plural subjects such as 'emissions' usually take 'are'.",
    );
  if (/\b(?:informations|more better)\b/i.test(answer))
    notes.push(
      "Use 'information' as an uncountable noun and 'better' rather than 'more better'.",
    );
  const points = criteria.map((criterion, index): WritingFeedbackPoint => {
    const matches = criterion.groups
      .map((group) =>
        group.find((phrase) =>
          sentences.some((sentence) =>
            includesPhrase(tokens(sentence), phrase),
          ),
        ),
      )
      .filter((p): p is string => Boolean(p));
    const required = criterion.minimum ?? criterion.groups.length;
    const conflict = criterion.conflicts?.some((pattern) =>
      sentences.some((sentence) => {
        const value = normalized(sentence);
        const hit = new RegExp(pattern, "i").exec(value);
        if (!hit) return false;
        // A nearby denial can quote a mistaken claim in order to reject it.
        // Negation inside the matched false claim is different from a preceding denial.
        if (
          /\b(?:not|never|no|cannot|can not|does not)\b/.test(
            value.slice(Math.max(0, hit.index - 45), hit.index),
          )
        )
          return false;
        return true;
      }),
    );
    const detected =
      matches.length >= required && required > 0 && hasClause && !conflict;
    const evidence = sentences
      .filter((sentence) =>
        matches.some((phrase) => includesPhrase(tokens(sentence), phrase)),
      )
      .slice(0, 2)
      .map((sentence) =>
        sentence.length > 280 ? sentence.slice(0, 277) + "…" : sentence,
      );
    return {
      index,
      label: labels[index] || `Reference point ${index + 1}`,
      status: conflict
        ? "review"
        : detected
          ? "detected"
          : matches.length
            ? "partial"
            : "missing",
      matched: [...new Set(matches)].slice(0, 20),
      evidence,
      suggestion: conflict
        ? "Check the meaning of this claim against the passage. " +
          criterion.guidance
        : criterion.guidance,
    };
  });
  return {
    engineVersion: 1,
    criteriaVersion: 1,
    kind: configured ? "curated" : "source-checklist",
    detected: points.filter((p) => p.status === "detected").length,
    total: points.length,
    points,
    notes: notes.slice(0, 6),
  };
}
export function feedbackRating(report: WritingFeedback): 1 | 2 | 3 {
  return report.detected === 0 ? 1 : report.detected === report.total ? 3 : 2;
}
export function validWritingFeedback(value: unknown): value is WritingFeedback {
  if (!value || typeof value !== "object") return false;
  const r = value as WritingFeedback;
  return (
    r.engineVersion === 1 &&
    r.criteriaVersion === 1 &&
    ["curated", "source-checklist"].includes(r.kind) &&
    Array.isArray(r.points) &&
    r.points.length > 0 &&
    r.points.length <= 10 &&
    r.total === r.points.length &&
    Number.isInteger(r.detected) &&
    r.detected >= 0 &&
    r.detected <= r.total &&
    r.detected === r.points.filter((p) => p?.status === "detected").length &&
    r.points.every(
      (p, i) =>
        p &&
        p.index === i &&
        typeof p.label === "string" &&
        p.label.length <= 400 &&
        ["detected", "partial", "missing", "review"].includes(p.status) &&
        typeof p.suggestion === "string" &&
        p.suggestion.length <= 1000 &&
        [p.matched, p.evidence].every(
          (a) =>
            Array.isArray(a) &&
            a.length <= 20 &&
            a.every((s) => typeof s === "string" && s.length <= 500),
        ),
    ) &&
    Array.isArray(r.notes) &&
    r.notes.length <= 10 &&
    r.notes.every((n) => typeof n === "string" && n.length <= 500)
  );
}
