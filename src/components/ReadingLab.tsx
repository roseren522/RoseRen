import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  FlaskConical,
  GraduationCap,
  Highlighter,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import { readings, sources, seed, dailyLiterature } from "../data";
import { db } from "../lib/store";
import { HighlightedText, ReadingHighlights } from "./ReadingHighlights";
import type { HighlightPayload } from "../lib/highlights";
import { readingHash, readReadingRoute } from "../lib/readingRoute";
import {
  checkWritingAnswer,
  feedbackRating,
  validWritingFeedback,
  type WritingFeedback as WritingReport,
} from "../lib/writingFeedback";
const WritingFeedback = lazy(() => import("./WritingFeedback"));
import {
  readingAnswers,
  readingHistory,
  readingSourceLink,
  readingSummary,
  readingTopics,
  type ReadingLesson,
  type ReadingPayload,
  type ReadingQuestion,
  type ReadingVisitPayload,
} from "../lib/reading";
import type { Entry, LearningEvent } from "../lib/model";
type SaveReview = (
  payload: ReadingPayload,
  entryId: string,
  id: string,
) => Promise<unknown>;
interface Props {
  scope: string;
  userId?: string;
  restoringAccount?: boolean;
  events: LearningEvent[];
  highlightEvents: LearningEvent[];
  saveHighlight: (
    payload: HighlightPayload,
    eventId: string,
  ) => Promise<unknown>;
  saveReview: SaveReview;
  saveProgress: (payload: ReadingVisitPayload) => Promise<unknown>;
  studyVocabulary: (entries: Entry[]) => void;
}
function useDraft(scope: string, key: string) {
  const [value, setValue] = useState(""),
    [status, setStatus] = useState<
      "loading" | "empty" | "saving" | "saved" | "error"
    >("loading");
  const alive = useRef(false),
    revision = useRef(0),
    pending = useRef(Promise.resolve());
  useEffect(() => {
    alive.current = true;
    db.drafts
      .get([scope, key])
      .then((row) => {
        if (alive.current) {
          setValue(row?.answer || "");
          setStatus(row ? "saved" : "empty");
        }
      })
      .catch(() => {
        if (alive.current) setStatus("error");
      });
    return () => {
      alive.current = false;
    };
  }, [scope, key]);
  const update = (text: string) => {
    setValue(text);
    setStatus("saving");
    const rev = ++revision.current;
    pending.current = pending.current
      .catch(() => {})
      .then(async () => {
        await db.drafts.put({
          scope,
          key,
          answer: text,
          updatedAt: new Date().toISOString(),
        });
        if (alive.current && rev === revision.current) setStatus("saved");
      })
      .catch(() => {
        if (alive.current && rev === revision.current) setStatus("error");
      });
  };
  const clear = async () => {
    await pending.current;
    await db.drafts.delete([scope, key]);
  };
  return { value, status, update, clear };
}
export default function ReadingLab({
  scope,
  userId,
  restoringAccount = false,
  events,
  highlightEvents,
  saveHighlight,
  saveReview,
  saveProgress,
  studyVocabulary,
}: Props) {
  const [selected, setSelected] = useState<string | null>(
      () => readReadingRoute(location.hash, readings)?.lessonId || null,
    ),
    [query, setQuery] = useState(""),
    [topic, setTopic] = useState("All topics"),
    [level, setLevel] = useState("All levels"),
    [filter, setFilter] = useState("All passages");
  const lesson = readings.find((l) => l.id === selected);
  const summary = readingSummary(events, readings);
  const history = readingHistory(events, readings);
  const [progressError, setProgressError] = useState("");
  const [progressSaving, setProgressSaving] = useState(false);
  const failedProgress = useRef<ReadingVisitPayload | null>(null);
  const progressSaver = useRef(saveProgress);
  progressSaver.current = saveProgress;
  const progressRevision = useRef(0);
  const recordProgress = (payload: ReadingVisitPayload) => {
    const revision = ++progressRevision.current;
    setProgressSaving(true);
    void progressSaver
      .current(payload)
      .then(() => {
        if (revision === progressRevision.current) {
          setProgressSaving(false);
          failedProgress.current = null;
          setProgressError("");
        }
      })
      .catch(() => {
        if (revision === progressRevision.current) {
          setProgressSaving(false);
          failedProgress.current = payload;
          setProgressError(
            "Reading position could not be saved. Keep this page open and retry.",
          );
        }
      });
  };
  const [questionIndex, setQuestionIndex] = useState(
      () => readReadingRoute(location.hash, readings)?.questionIndex || 0,
    ),
    [highlight, setHighlight] = useState<number[]>([]);
  const restoredVisit = useRef(false);
  useEffect(() => {
    const route = readReadingRoute(location.hash, readings);
    if (!route || restoredVisit.current) return;
    restoredVisit.current = true;
    const item = readings.find((l) => l.id === route.lessonId)!;
    recordProgress({
      activity: "reading-progress",
      version: item.version,
      lessonId: item.id,
      questionId: item.questions[route.questionIndex].id,
      reachedEnd: history.some(
        (row) => row.lesson.id === item.id && row.reachedEnd,
      ),
    });
  }, []);
  useEffect(() => {
    if (!selected) return;
    const key = `fieldnotes-reading-scroll:${scope}:${selected}`;
    let restoring = true;
    let lastY = window.scrollY;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      if (restoring) return;
      try {
        sessionStorage.setItem(key, String(lastY));
      } catch {
        /* URL and durable learning records still restore without session storage. */
      }
    };
    const restore = () => {
      try {
        const value = sessionStorage.getItem(key);
        const top = value === null ? NaN : Number(value);
        if (Number.isFinite(top) && top >= 0 && top <= 500000)
          window.scrollTo({ top, behavior: "instant" });
      } catch {
        /* Native browser scroll restoration remains available. */
      }
      restoring = false;
      lastY = window.scrollY;
    };
    const frame = requestAnimationFrame(() => {
      restore();
    });
    const schedule = () => {
      if (readReadingRoute(location.hash, readings)?.lessonId !== selected)
        return;
      lastY = window.scrollY;
      clearTimeout(timer);
      timer = setTimeout(save, 100);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      save();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, [scope, selected]);
  useEffect(() => {
    const restore = () => {
      const route = readReadingRoute(location.hash, readings);
      setSelected(route?.lessonId || null);
      setQuestionIndex(route?.questionIndex || 0);
      setHighlight([]);
    };
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("hashchange", restore);
      window.removeEventListener("popstate", restore);
      window.removeEventListener("pageshow", restore);
    };
  }, []);
  const backToLibrary = () => {
    setSelected(null);
    setHighlight([]);
    location.hash = "reading";
  };
  const open = (item: ReadingLesson) => {
    const answers = readingAnswers(events, item);
    const previous = history.find((row) => row.lesson.id === item.id);
    const cursor = item.questions.findIndex(
      (q) => q.id === previous?.questionId && !answers[q.id],
    );
    const index =
      cursor >= 0
        ? cursor
        : Math.max(
            0,
            item.questions.findIndex((q) => !answers[q.id]),
          );
    setQuestionIndex(index);
    setSelected(item.id);
    setHighlight([]);
    location.hash = readingHash(item.id, item.questions[index].id);
    recordProgress({
      activity: "reading-progress",
      version: item.version,
      lessonId: item.id,
      questionId: item.questions[index].id,
      reachedEnd: previous?.reachedEnd || false,
    });
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const jump = (index: number) => {
    if (!lesson) return;
    setQuestionIndex(index);
    setHighlight([]);
    window.history.replaceState(
      window.history.state,
      "",
      readingHash(lesson.id, lesson.questions[index].id),
    );
    recordProgress({
      activity: "reading-progress",
      version: lesson.version,
      lessonId: lesson.id,
      questionId: lesson.questions[index].id,
      reachedEnd: history.some(
        (row) => row.lesson.id === lesson.id && row.reachedEnd,
      ),
    });
  };
  const reachedEnd = history.some(
    (row) => row.lesson.id === lesson?.id && row.reachedEnd,
  );
  useEffect(() => {
    if (!lesson || reachedEnd || typeof IntersectionObserver === "undefined")
      return;
    const target = document.querySelector(".reading-end-marker");
    if (!target) return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          recordProgress({
            activity: "reading-progress",
            version: lesson.version,
            lessonId: lesson.id,
            questionId: lesson.questions[questionIndex].id,
            reachedEnd: true,
          });
        }
      },
      { threshold: 1 },
    );
    observer.observe(target);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [lesson?.id, questionIndex, reachedEnd]);
  const filtered = readings.filter((item) => {
    const answers = readingAnswers(events, item),
      count = Object.keys(answers).length;
    return (
      (topic === "All topics" || item.topic === topic) &&
      (level === "All levels" || item.level === level) &&
      (!query ||
        [
          item.title,
          item.subtitle,
          item.topic,
          ...item.terms.map((t) => t.term),
        ].some((t) => t.toLowerCase().includes(query.toLowerCase()))) &&
      (filter === "All passages" ||
        (filter === "My history" &&
          history.some((row) => row.lesson.id === item.id)) ||
        (filter === "Latest literature" && item.evidenceType === "abstract") ||
        (filter === "Not completed" && count < item.questions.length) ||
        (filter === "Needs another look" &&
          Object.values(answers).some((e) => Number(e.payload.rating) < 3)))
    );
  });
  if (lesson) {
    const records = readingAnswers(events, lesson),
      source = sources.find((s) => s.id === lesson.sourceId)!;
    const question = lesson.questions[questionIndex];
    const completed = Object.keys(records).length === lesson.questions.length;
    return (
      <ReadingHighlights
        key={`${scope}:${lesson.id}:v${lesson.version}`}
        lessonId={lesson.id}
        version={lesson.version}
        events={highlightEvents}
        saveHighlight={saveHighlight}
      >
        <div
          className="reading-lab notranslate"
          lang="en"
          translate="no"
          data-immersive-translate="off"
        >
          <div className="reading-breadcrumb">
            <button className="text-button" onClick={backToLibrary}>
              <ArrowLeft size={15} />
              All passages
            </button>
            <span>{lesson.topic}</span>
            <span>
              {Object.keys(records).length} / {lesson.questions.length} answered
            </span>
          </div>
          <div className="reading-title">
            <div className="eyebrow">READ CLOSELY. THINK CLEARLY.</div>
            <h1>{lesson.title}</h1>
            <p>{lesson.subtitle}</p>
            <div className="reading-tags">
              <span>{lesson.level}</span>
              <span>
                {lesson.paragraphs.join(" ").split(/\s+/).length} words
              </span>
              <span>2 multiple-choice · 1 written response</span>
            </div>
          </div>
          {progressError && (
            <div className="reading-error" role="alert">
              {progressError}{" "}
              <button
                className="text-button"
                onClick={() =>
                  failedProgress.current &&
                  recordProgress(failedProgress.current)
                }
              >
                Retry saving position
              </button>
            </div>
          )}
          <p className="reading-position-note">
            {progressSaving
              ? "Saving reading position…"
              : progressError
                ? "Reading position has not been saved yet."
                : reachedEnd
                  ? "Passage end reached · reading state saved."
                  : "Reading position is saved automatically."}{" "}
            Checked answers and self-assessed responses are kept in your
            learning history.
          </p>
          <div className="reading-workspace">
            <article className="reading-article panel">
              <div className="reading-section-label">
                <BookOpen size={17} />
                <span>THE PASSAGE</span>
                <span>
                  01—{String(lesson.paragraphs.length).padStart(2, "0")}
                </span>
              </div>
              <div className="adaptation-label">
                <ShieldCheck size={14} />
                {lesson.evidenceType === "abstract"
                  ? "Open-access abstract · verbatim source text"
                  : "Source-based learning adaptation · not a quotation"}
              </div>
              <div className="reading-text">
                {lesson.paragraphs.map((text, i) => (
                  <p
                    key={i}
                    className={
                      highlight.includes(i + 1) ? "evidence-active" : ""
                    }
                  >
                    <span className="paragraph-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <HighlightedText text={text} blockId={`paragraph:${i}`} />
                  </p>
                ))}
              </div>
              <span className="reading-end-marker" aria-hidden="true" />
              <details className="reading-glossary">
                <summary>
                  Key language <span>{lesson.terms.length} expressions</span>
                </summary>
                {lesson.terms.map((t) => (
                  <div key={t.term}>
                    <strong>{t.term}</strong>
                    <p>{t.definition}</p>
                  </div>
                ))}
                <button
                  className="text-button"
                  onClick={() =>
                    studyVocabulary(
                      seed.filter((e) =>
                        lesson.terms.some(
                          (t) => t.term.toLowerCase() === e.term.toLowerCase(),
                        ),
                      ),
                    )
                  }
                >
                  Study matching vocabulary
                  <ArrowRight size={14} />
                </button>
              </details>
              <details className="reading-source">
                <summary>
                  <FileText size={15} />
                  Source & verification details
                </summary>
                <p>
                  <strong>{source.title}</strong>
                </p>
                <p>
                  {source.kind === "article"
                    ? source.organization
                    : source.id.startsWith("ipcc-")
                      ? "IPCC / National Greenhouse Gas Inventories Programme"
                      : "US EPA official repository / CMAS technical guidance"}{" "}
                  · {source.year}
                </p>
                {source.authors && <p>{source.authors}</p>}
                <p>{lesson.location}</p>
                <a
                  href={readingSourceLink(lesson, source)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.kind === "article"
                    ? "Open source article"
                    : "Open the inspected source"}
                  <ExternalLink size={13} />
                </a>
                <p>
                  {source.kind === "article" || source.id.startsWith("ipcc-")
                    ? source.scope
                    : "Scope: versioned CMAQ atmospheric chemistry, transport, model evaluation and surface-exchange guidance."}
                </p>
                <p>
                  {source.kind === "article" ? (
                    <>
                      Abstract automatically retrieved through Europe PMC. Only
                      the abstract is reproduced; Fieldnotes has not reviewed
                      the full paper. Paragraph labels and learning questions
                      were added. Definitions come from the maintained glossary.
                      Context questions use source wording; written answers
                      offer reference-point feedback and optional
                      self-assessment. No expert review or AI grading is
                      claimed.
                    </>
                  ) : (
                    <>
                      The source was inspected. This passage, its questions and
                      reference answers are original educational adaptations,
                      not quotations or a validated examination. The CMAQ guide
                      carries a CMAS-reviewed draft disclaimer. IPCC methods are
                      used only within their stated greenhouse-gas inventory
                      scope.
                    </>
                  )}
                </p>
                {source.kind === "article" && (
                  <p>
                    Published: {source.publishedAt}. Added:{" "}
                    {lesson.addedAt?.slice(0, 10)}.
                    {source.doi && <> DOI: {source.doi}.</>}{" "}
                    <a
                      href={source.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.license} · reuse license{" "}
                      <ExternalLink size={13} />
                    </a>
                  </p>
                )}
              </details>
            </article>
            <section className="reading-exercise">
              <div
                className="question-navigation"
                aria-label="Question navigation"
              >
                {lesson.questions.map((q, i) => (
                  <button
                    key={q.id}
                    className={i === questionIndex ? "active" : ""}
                    onClick={() => {
                      jump(i);
                    }}
                    aria-current={i === questionIndex ? "step" : undefined}
                  >
                    {records[q.id] ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <span>{i + 1}</span>
                    )}
                    {q.type === "short"
                      ? "Written response"
                      : `Question ${i + 1}`}
                  </button>
                ))}
              </div>
              <ReadingExercise
                key={`${scope}:${lesson.id}:${question.id}`}
                lesson={lesson}
                question={question}
                scope={scope}
                userId={userId}
                record={records[question.id]}
                saveReview={saveReview}
                onEvidence={() => setHighlight(question.paragraphs)}
              />
              <div className="reading-question-footer">
                <button
                  className="button secondary"
                  disabled={questionIndex === 0}
                  onClick={() => {
                    jump(questionIndex - 1);
                  }}
                >
                  <ArrowLeft size={14} />
                  Previous
                </button>
                {questionIndex < lesson.questions.length - 1 ? (
                  <button
                    className="button primary"
                    onClick={() => {
                      jump(questionIndex + 1);
                    }}
                  >
                    Next question
                    <ArrowRight size={14} />
                  </button>
                ) : (
                  <button className="button primary" onClick={backToLibrary}>
                    Back to passages
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
              {completed && (
                <div className="reading-complete">
                  <GraduationCap size={22} />
                  <div>
                    <strong>Passage practice complete</strong>
                    <p>
                      All three responses are recorded. Revisit any question to
                      review your reasoning.
                    </p>
                  </div>
                </div>
              )}
              <div className="reading-takeaway">
                <span>TAKE THIS INTO YOUR RESEARCH</span>
                <p>{lesson.takeaway}</p>
              </div>
            </section>
          </div>
        </div>
      </ReadingHighlights>
    );
  }
  return (
    <div
      className="reading-lab notranslate"
      lang="en"
      translate="no"
      data-immersive-translate="off"
    >
      <div className="page-heading generic-heading">
        <div>
          <div className="eyebrow">READING LAB · RESEARCH ENGLISH</div>
          <h1>Go beyond the word.</h1>
          <p>
            Read a scientific argument. Test your understanding. Explain it in
            your own words.
          </p>
        </div>
        <div className="reading-count-badge">
          <BookOpen size={18} />
          <span>
            {readings.length} passages
            <br />
            <small>
              {readings.reduce((n, l) => n + l.questions.length, 0)} questions ·
              all in English
            </small>
          </span>
        </div>
      </div>
      {restoringAccount && (
        <p className="reading-position-note" role="status">
          Your account history is still being restored. Records on this device
          remain available; passages without local records are not yet confirmed
          as unread. Check the sync status above.
        </p>
      )}
      {history[0] && (
        <section
          className="reading-resume panel"
          aria-label="Your reading history"
        >
          <div>
            <span className="tiny-label">PICK UP WHERE YOU LEFT OFF</span>
            <h2>{history[0].lesson.title}</h2>
            <p>
              {history[0].answered} / {history[0].lesson.questions.length}{" "}
              answers saved ·{" "}
              {history[0].complete
                ? "Practice complete"
                : history[0].reachedEnd
                  ? "Passage read · practice in progress"
                  : "Reading in progress"}
            </p>
            <p>
              Last activity:{" "}
              {new Date(history[0].latest.at).toLocaleString("en-GB")}
            </p>
          </div>
          <button
            className="button primary"
            onClick={() => open(history[0].lesson)}
          >
            Resume reading <ArrowRight size={15} />
          </button>
        </section>
      )}
      {progressError && (
        <div className="reading-error" role="alert">
          {progressError}{" "}
          <button
            className="text-button"
            onClick={() =>
              failedProgress.current && recordProgress(failedProgress.current)
            }
          >
            Retry saving position
          </button>
        </div>
      )}
      <section
        className="daily-literature-status"
        aria-label="Daily literature updates"
      >
        <div>
          <span className="tiny-label">DAILY DISCOVERY</span>
          <h2>New papers. More context.</h2>
          <p>
            Environment, atmosphere, climate, ecology, energy and research
            methods. Up to 3 licensed English abstracts per day, with
            source-context questions and vocabulary from our maintained
            glossary.
          </p>
        </div>
        <div>
          <strong>{dailyLiterature.articles.length} articles added</strong>
          <p>
            {dailyLiterature.lastCheckedAt
              ? `Last successful search: ${new Date(dailyLiterature.lastCheckedAt).toLocaleString("en-GB", { timeZoneName: "short" })}`
              : "Awaiting the first successful automated search."}
          </p>
          {dailyLiterature.lastAddedAt && (
            <p>Latest addition: {dailyLiterature.lastAddedAt.slice(0, 10)}</p>
          )}
          <p>
            Daily schedule: 08:17 China time. Search indexing and scheduled runs
            can be delayed; some days have no eligible new papers.
          </p>
        </div>
      </section>
      <div className="reading-intro">
        <div>
          <span className="tiny-label">FROM READING TO REASONING</span>
          <h2>
            A little more context.
            <br />A deeper understanding.
          </h2>
          <p>
            Atmospheric processes, environmental chemistry, emissions, data
            quality and research methods — grounded in inspected technical
            guidance.
          </p>
        </div>
        <div className="reading-flow">
          <span>
            <BookOpen size={18} />
            Read closely
          </span>
          <ChevronRight size={16} />
          <span>
            <FlaskConical size={18} />
            Test a claim
          </span>
          <ChevronRight size={16} />
          <span>
            <GraduationCap size={18} />
            Explain why
          </span>
        </div>
      </div>
      <div className="reading-overview">
        <div>
          <strong>
            {summary.complete}
            <small> / {readings.length}</small>
          </strong>
          <span>Passages completed</span>
        </div>
        <div>
          <strong>{summary.answered}</strong>
          <span>Questions answered</span>
        </div>
        <div>
          <strong>
            {summary.choiceCount
              ? `${Math.round((summary.choiceCorrect / summary.choiceCount) * 100)}%`
              : "—"}
          </strong>
          <span>Latest multiple-choice accuracy</span>
        </div>
      </div>
      <div className="reading-filters">
        <label className="search-box">
          <Search size={17} />
          <input
            placeholder="Search ideas or research language…"
            aria-label="Search reading passages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Reading topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          {["All topics", ...readingTopics].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          aria-label="Reading level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          {["All levels", "Intermediate", "Advanced"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="list-tabs">
        {[
          "All passages",
          "My history",
          "Latest literature",
          "Not completed",
          "Needs another look",
        ].map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <span>{filtered.length} passages</span>
      </div>
      <div className="reading-cards">
        {[...filtered]
          .sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""))
          .map((item) => {
            const records = readingAnswers(events, item),
              count = Object.keys(records).length;
            const visit = history.find((row) => row.lesson.id === item.id);
            return (
              <article key={item.id} className="reading-card panel">
                <div className="reading-card-top">
                  <span className="topic-pill">{item.topic}</span>
                  <span>{item.level}</span>
                </div>
                <h2>{item.title}</h2>
                <p>{item.subtitle}</p>
                <p
                  className={`reading-state ${count === item.questions.length ? "complete" : ""}`}
                >
                  {count === item.questions.length
                    ? "Practice complete"
                    : visit?.reachedEnd
                      ? "Read · practice incomplete"
                      : visit
                        ? "Reading in progress"
                        : restoringAccount
                          ? "Checking saved history"
                          : "Not started"}
                  {visit && (
                    <span>
                      {" "}
                      · {new Date(visit.latest.at).toLocaleDateString("en-GB")}
                    </span>
                  )}
                </p>
                <div className="reading-card-source">
                  <ShieldCheck size={13} />
                  {item.evidenceType === "abstract"
                    ? `Open-access abstract · ${item.publishedAt}`
                    : item.sourceId.startsWith("ipcc-")
                      ? "IPCC Guidelines · 2006"
                      : "CMAQ technical guidance · 2022"}
                </div>
                <div className="reading-card-progress">
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${(count / item.questions.length) * 100}%`,
                      }}
                    />
                  </div>
                  <span>
                    {count} / {item.questions.length} answered
                  </span>
                </div>
                <button className="button secondary" onClick={() => open(item)}>
                  {count === item.questions.length
                    ? "Review passage"
                    : count || visit
                      ? "Continue reading"
                      : "Start reading"}
                  <ArrowRight size={15} />
                </button>
              </article>
            );
          })}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <BookOpen size={30} />
          <h2>
            {filter === "Latest literature" && !dailyLiterature.articles.length
              ? "New literature will appear here."
              : "No passages match these filters."}
          </h2>
          <p>
            {filter === "Latest literature" && !dailyLiterature.articles.length
              ? "The first successful daily search will add eligible open-access abstracts. Existing reading exercises are available under All passages."
              : "Try another topic or clear the search."}
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setTopic("All topics");
              setLevel("All levels");
              setFilter("All passages");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <p className="reading-library-note">
        <ShieldCheck size={16} />
        Technical-guide lessons are educational adaptations; recent papers use
        licensed abstracts. Multiple-choice answers include explanations;
        written responses offer keyword-based reference checks and optional
        self-assessment.
      </p>
    </div>
  );
}
function ReadingExercise({
  lesson,
  question,
  scope,
  userId,
  record,
  saveReview,
  onEvidence,
}: {
  lesson: ReadingLesson;
  question: ReadingQuestion;
  scope: string;
  userId?: string;
  record?: LearningEvent;
  saveReview: SaveReview;
  onEvidence: () => void;
}) {
  const draft = useDraft(
    scope,
    `${lesson.id}:v${lesson.version}:${question.id}`,
  );
  const [showReference, setShowReference] = useState(false),
    [checks, setChecks] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [retrying, setRetrying] = useState(false);
  const lock = useRef(false),
    attemptId = useRef(crypto.randomUUID());
  const [feedback, setFeedback] = useState<{
    answer: string;
    report: WritingReport;
    saved: boolean;
  } | null>(null);
  const saved = retrying ? undefined : record;
  const answer = saved ? String(saved.payload.answer) : draft.value;
  const referenceVisible = Boolean(saved) || showReference;
  const previousFeedback = saved?.payload.feedback;
  const storedFeedback = validWritingFeedback(previousFeedback)
    ? previousFeedback
    : undefined;
  const currentFeedback =
    feedback?.answer === answer
      ? feedback
      : storedFeedback
        ? { answer, report: storedFeedback, saved: true }
        : null;
  const checkAnswer = async () => {
    if (lock.current || !answer.trim()) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const report = checkWritingAnswer(answer, lesson, question);
      setFeedback({ answer, report, saved: false });
      setShowReference(true);
      await saveReview(
        {
          activity: "reading",
          version: lesson.version,
          lessonId: lesson.id,
          questionId: question.id,
          questionType: "short",
          answer,
          rating: feedbackRating(report),
          assessment: "reference",
          feedback: report,
        },
        `reading:${lesson.id}:${question.id}`,
        attemptId.current,
      );
      await draft.clear().catch(() => {});
      setRetrying(false);
      setFeedback({ answer, report, saved: true });
    } catch {
      setMessage(
        "Your checked answer and feedback could not be saved. Keep this page open and retry; your response is retained.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const submit = async (rating: 1 | 2 | 3 | 4) => {
    if (lock.current || saved || !answer.trim()) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await saveReview(
        {
          activity: "reading",
          version: lesson.version,
          lessonId: lesson.id,
          questionId: question.id,
          questionType: question.type,
          answer,
          rating,
          assessment: question.type === "choice" ? "objective" : "self",
          ...(question.type === "short" ? { rubricChecks: checks } : {}),
        },
        `reading:${lesson.id}:${question.id}`,
        attemptId.current,
      );
      await draft.clear().catch(() => {});
      setRetrying(false);
      setShowReference(true);
      setFeedback(null);
    } catch {
      setMessage(
        "Your answer could not be saved. Keep this page open and try again; the current response is retained.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const tryAgain = () => {
    attemptId.current = crypto.randomUUID();
    setRetrying(true);
    draft.update(question.type === "short" ? answer : "");
    setFeedback(null);
    setShowReference(false);
    setChecks([]);
    setMessage("");
  };
  return (
    <div className="reading-question panel">
      <div className="reading-section-label">
        <span>
          {question.type === "choice" ? "MULTIPLE CHOICE" : "WRITTEN RESPONSE"}
        </span>
        <span>{question.skill}</span>
      </div>
      <h2>
        <HighlightedText
          text={question.prompt}
          blockId={`question:${question.id}:prompt`}
        />
      </h2>
      {question.type === "choice" ? (
        <>
          <fieldset
            className="reading-options"
            disabled={Boolean(saved) || busy || draft.status === "loading"}
          >
            <legend className="sr-only">Choose one answer</legend>
            {question.choices!.map((option) => (
              <label
                key={option.id}
                className={`${answer === option.id ? "selected" : ""} ${saved && option.id === question.correct ? "correct" : ""} ${saved && answer === option.id && answer !== question.correct ? "incorrect" : ""}`}
              >
                <input
                  type="radio"
                  name={`${lesson.id}-${question.id}`}
                  value={option.id}
                  checked={answer === option.id}
                  onChange={() => draft.update(option.id)}
                />
                <span className="reading-option-letter">
                  {option.id.toUpperCase()}
                </span>
                <span>
                  <HighlightedText
                    text={option.text}
                    blockId={`question:${question.id}:choice:${option.id}`}
                  />
                </span>
                {saved && option.id === question.correct && <Check size={15} />}
              </label>
            ))}
          </fieldset>
          {!saved && (
            <button
              className="button primary"
              disabled={!answer || busy || draft.status === "loading"}
              onClick={() => void submit(answer === question.correct ? 3 : 1)}
            >
              {busy ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Check size={15} />
              )}
              Check & save answer
            </button>
          )}
          {saved && (
            <div
              className={`reading-feedback ${saved.payload.rating === 3 ? "correct" : "incorrect"}`}
              role="status"
            >
              <strong>
                {saved.payload.rating === 3
                  ? "Correct — now check the reasoning."
                  : "Not quite — revisit the evidence."}
              </strong>
              <p>
                <HighlightedText
                  text={question.explanation}
                  blockId={`question:${question.id}:explanation`}
                />
              </p>
              <p>
                <b>Your choice:</b>{" "}
                {question.choices!.find((c) => c.id === answer)?.text}
              </p>
              <p>
                {question.choices!.find((c) => c.id === answer)?.explanation}
              </p>
              {answer !== question.correct && (
                <p>
                  <b>Best answer:</b>{" "}
                  {
                    question.choices!.find((c) => c.id === question.correct)
                      ?.text
                  }
                </p>
              )}
            </div>
          )}
          {!saved && (
            <div className="reading-draft-status" role="status">
              {draft.status === "saved" ? (
                "Choice saved on this device. Check your answer to record a completed response."
              ) : draft.status === "saving" ? (
                "Saving choice…"
              ) : draft.status === "loading" ? (
                "Restoring choice…"
              ) : draft.status === "error" ? (
                <span>
                  Choice save failed.{" "}
                  <button
                    className="text-button"
                    onClick={() => draft.update(draft.value)}
                  >
                    Retry
                  </button>
                </span>
              ) : (
                "Your choice is saved automatically."
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <label
            className="reading-answer-label"
            htmlFor={`answer-${question.id}`}
          >
            Your explanation, in English
          </label>
          <textarea
            id={`answer-${question.id}`}
            className="reading-answer"
            rows={7}
            maxLength={8000}
            disabled={Boolean(saved) || busy || draft.status === "loading"}
            value={answer}
            onChange={(e) => draft.update(e.target.value)}
            placeholder="Make a claim, explain the reasoning, and connect it to the passage…"
          />
          {!saved && (
            <div
              className={`reading-draft-status ${draft.status === "error" ? "error" : ""}`}
              role="status"
            >
              {draft.status === "loading" ? (
                "Restoring draft…"
              ) : draft.status === "saving" ? (
                "Saving draft on this device…"
              ) : draft.status === "saved" ? (
                userId ? (
                  "Draft saved on this device. Completed assessments use your account sync."
                ) : (
                  "Draft saved on this device. Sign in to sync completed answers."
                )
              ) : draft.status === "error" ? (
                <span>
                  Draft save failed.{" "}
                  <button
                    className="text-button"
                    onClick={() => draft.update(draft.value)}
                  >
                    Retry
                  </button>
                </span>
              ) : (
                "Your draft stays on this device; assess your response to save a completed answer."
              )}
            </div>
          )}
          {(!currentFeedback || !currentFeedback.saved) && (
            <button
              className="button primary writing-check-button"
              disabled={
                !answer.trim() ||
                busy ||
                draft.status === "saving" ||
                draft.status === "loading"
              }
              onClick={() => void checkAnswer()}
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <CheckCircle2 size={15} />
              )}
              {busy
                ? "Checking & saving…"
                : currentFeedback
                  ? "Retry check & save"
                  : "Check my answer"}
            </button>
          )}
          {currentFeedback && (
            <Suspense
              fallback={
                <p className="writing-feedback-note" role="status">
                  Preparing feedback…
                </p>
              }
            >
              <WritingFeedback
                report={currentFeedback.report}
                saved={currentFeedback.saved}
              />
            </Suspense>
          )}
          {feedback && feedback.answer !== answer && (
            <p className="writing-feedback-note">
              Your answer has changed. Check it again to update the feedback.
            </p>
          )}
          {!referenceVisible && (
            <button
              className="button secondary"
              disabled={
                !answer.trim() ||
                draft.status === "saving" ||
                draft.status === "loading"
              }
              onClick={() => setShowReference(true)}
            >
              Compare with reference points
              <ArrowRight size={15} />
            </button>
          )}
          {referenceVisible && (
            <div className="reading-reference">
              <span className="tiny-label">
                REFERENCE ANSWER · ONE POSSIBLE EXPLANATION
              </span>
              <p>
                <HighlightedText
                  text={question.modelAnswer || ""}
                  blockId={`question:${question.id}:reference`}
                />
              </p>
              <h3>
                {saved?.payload.assessment === "reference"
                  ? "Review the original reference points"
                  : saved
                    ? "Your saved self-assessment"
                    : "Check your reasoning"}
              </h3>
              <p className="reading-reference-hint">
                Equivalent wording is welcome. These points guide your own
                assessment; they are not an automated correctness score.
              </p>
              {question.rubric?.map((point, i) =>
                saved?.payload.assessment === "reference" ? (
                  <p className="reading-reference-point" key={point}>
                    • {point}
                  </p>
                ) : (
                  <label className="reading-rubric" key={point}>
                    <input
                      type="checkbox"
                      disabled={Boolean(saved)}
                      checked={
                        saved
                          ? (
                              (saved.payload.rubricChecks as number[]) || []
                            ).includes(i)
                          : checks.includes(i)
                      }
                      onChange={(e) =>
                        setChecks((v) =>
                          e.target.checked
                            ? [...v, i]
                            : v.filter((n) => n !== i),
                        )
                      }
                    />
                    <span>{point}</span>
                  </label>
                ),
              )}
              {!saved ? (
                <div className="reading-self-grade">
                  <span>
                    How well does your explanation address the passage?
                  </span>
                  <div>
                    {(
                      [
                        [1, "Revisit"],
                        [2, "Partly there"],
                        [3, "Well supported"],
                      ] as const
                    ).map(([rating, label]) => (
                      <button
                        className="button secondary"
                        key={rating}
                        disabled={busy}
                        onClick={() => void submit(rating)}
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={13} />
                        ) : (
                          <Check size={13} />
                        )}{" "}
                        {label}
                      </button>
                    ))}
                  </div>
                  <small>
                    Selecting a rating saves your completed answer. No AI
                    judgment is implied.
                  </small>
                </div>
              ) : saved.payload.assessment === "reference" ? (
                <p className="reading-self-result">
                  Reference coverage check recorded. The detected-point count is
                  not a correctness grade. Use Revise answer to improve your
                  response or record your own assessment.
                </p>
              ) : (
                <p className="reading-self-result">
                  Self-assessment:{" "}
                  <strong>
                    {Number(saved.payload.rating) === 1
                      ? "Revisit"
                      : Number(saved.payload.rating) === 2
                        ? "Partly there"
                        : "Well supported"}
                  </strong>
                </p>
              )}
            </div>
          )}
        </>
      )}
      {referenceVisible && (
        <button
          className="text-button reading-evidence-button"
          onClick={onEvidence}
        >
          <Highlighter size={15} />
          Highlight supporting paragraphs {question.paragraphs.join(", ")}
        </button>
      )}
      {saved && (
        <div className="reading-save-receipt">
          <CheckCircle2 size={14} />
          <span>
            {userId
              ? saved.synced
                ? "Saved to your cloud account"
                : "Saved on this device · waiting to sync"
              : "Saved on this device"}
          </span>
          <button className="text-button" onClick={tryAgain}>
            <RefreshCw size={12} />
            {question.type === "short" ? "Revise answer" : "Try again"}
          </button>
        </div>
      )}
      {message && (
        <div className="reading-error" role="alert">
          {message}
        </div>
      )}
    </div>
  );
}
