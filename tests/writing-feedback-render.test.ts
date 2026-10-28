import { createElement } from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import WritingFeedback from "../src/components/WritingFeedback";
import { readings } from "../src/data";
import {
  checkWritingAnswer,
  type WritingFeedback as Report,
} from "../src/lib/writingFeedback";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps the answer and reference visible if feedback rendering fails, then recovers for a revised report", () => {
  const lesson = readings[0],
    question = lesson.questions.find((q) => q.type === "short")!,
    answer = question.modelAnswer!,
    report = checkWritingAnswer(answer, lesson, question);
  // Exercise the rendering failure independently of the saved-data validator.
  const broken = { ...report, notes: null } as unknown as Report;
  vi.spyOn(console, "error").mockImplementation(() => {});
  const view = (value: Report) =>
    createElement(
      "div",
      null,
      createElement("textarea", {
        "aria-label": "Response",
        defaultValue: answer,
      }),
      createElement(WritingFeedback, { report: value, saved: true }),
      createElement("p", null, "The reference answer remains available."),
    );
  const rendered = render(view(broken));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Feedback could not be displayed",
  );
  expect(screen.getByLabelText("Response")).toHaveValue(answer);
  expect(
    screen.getByText("The reference answer remains available."),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry feedback" }));
  expect(screen.getByLabelText("Response")).toHaveValue(answer);
  rendered.rerender(view(report));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Answer feedback" }),
  ).toHaveTextContent("3 of 3 reference points detected");
});
