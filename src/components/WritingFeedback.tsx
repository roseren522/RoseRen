import { Component, type ReactNode } from "react";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  MessageSquareText,
} from "lucide-react";
import type { WritingFeedback as Report } from "../lib/writingFeedback";

interface Props {
  report: Report;
  saved: boolean;
}

// Feedback is optional UI: an unexpected rendering error must never unmount
// the exercise, its answer box, or the rest of the learning application.
class FeedbackBoundary extends Component<
  Props & { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.report !== this.props.report)
      this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="writing-feedback" aria-label="Answer feedback">
        <p role="alert">
          Feedback could not be displayed. Your response is still available in
          the answer box above.
        </p>
        {this.props.saved && (
          <p>Your checked answer is saved on this device.</p>
        )}
        <button
          className="button secondary"
          onClick={() => this.setState({ failed: false })}
        >
          Retry feedback
        </button>
      </section>
    );
  }
}

export default function WritingFeedback(props: Props) {
  return (
    <FeedbackBoundary {...props}>
      <FeedbackContent {...props} />
    </FeedbackBoundary>
  );
}

function FeedbackContent({ report, saved }: Props) {
  return (
    <section className="writing-feedback" aria-label="Answer feedback">
      <div className="writing-feedback-heading">
        <MessageSquareText size={19} />
        <div>
          <h3>Reference-point feedback</h3>
          <p>
            {report.detected} of {report.total} reference points detected
          </p>
        </div>
      </div>
      <p className="writing-feedback-note">
        This checks keywords and phrases, not scientific correctness. Equivalent
        wording can be missed; compare the evidence and revise where needed.
      </p>
      {report.kind === "source-checklist" && (
        <p className="writing-feedback-note">
          This abstract uses a general source-based checklist. Matched words or
          numbers do not establish that your summary interprets the findings
          correctly.
        </p>
      )}
      <ol className="writing-feedback-points">
        {report.points.map((point) => (
          <li
            key={point.index}
            className={`writing-feedback-point ${point.status}`}
          >
            <div className="writing-point-title">
              {point.status === "detected" ? (
                <CheckCircle2 size={16} />
              ) : point.status === "review" ? (
                <CircleAlert size={16} />
              ) : (
                <Circle size={16} />
              )}
              <strong>{point.label}</strong>
              <span>
                {
                  {
                    detected: "Detected",
                    partial: "Partly detected",
                    missing: "Not detected",
                    review: "Check meaning",
                  }[point.status]
                }
              </span>
            </div>
            {point.matched.length > 0 && (
              <p>
                <b>Matched cues:</b> {point.matched.join(" · ")}
              </p>
            )}
            {point.evidence.map((e, i) => (
              <blockquote key={i}>{e}</blockquote>
            ))}
            <p>
              <b>{point.status === "detected" ? "Review:" : "To improve:"}</b>{" "}
              {point.suggestion}
            </p>
          </li>
        ))}
      </ol>
      {report.notes.length > 0 && (
        <div className="writing-language-notes">
          <h4>Clarity & English</h4>
          <ul>
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="writing-feedback-saved" role="status">
        {saved
          ? "Checked answer and feedback saved on this device."
          : "Feedback generated. Save has not succeeded yet; retry the check to keep this report."}
      </p>
    </section>
  );
}
