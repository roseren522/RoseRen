import type { LearningEvent } from "./model";

export interface TextAnchor {
  blockId: string;
  start: number;
  end: number;
  quote: string;
}
export interface HighlightPayload extends Record<string, unknown> {
  activity: "reading-highlight";
  lessonId: string;
  version: number;
  highlightId: string;
  action: "add" | "remove";
  ranges?: TextAnchor[];
}
export const highlightEntryId = (id: string) => `reading-highlight:${id}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateHighlightEvent(event: LearningEvent) {
  const p = event.payload;
  if (
    event.kind !== "entry" ||
    p.activity !== "reading-highlight" ||
    typeof p.highlightId !== "string" ||
    !uuid.test(p.highlightId) ||
    event.entryId !== highlightEntryId(p.highlightId) ||
    typeof p.lessonId !== "string" ||
    !p.lessonId ||
    p.lessonId.length > 100 ||
    !Number.isInteger(p.version) ||
    Number(p.version) < 1 ||
    !["add", "remove"].includes(String(p.action))
  )
    throw new Error("Invalid reading highlight record");
  if (p.action === "remove") {
    if (p.ranges !== undefined)
      throw new Error("Removed highlights cannot carry text anchors");
    return;
  }
  if (!Array.isArray(p.ranges) || !p.ranges.length || p.ranges.length > 30)
    throw new Error("Invalid highlight selection");
  let length = 0;
  for (const r of p.ranges as TextAnchor[]) {
    if (
      !r ||
      typeof r.blockId !== "string" ||
      !/^(paragraph:\d{1,4}|question:[\w-]{1,80}:(prompt|choice:[\w-]{1,80}|reference|explanation))$/.test(
        r.blockId,
      ) ||
      !Number.isInteger(r.start) ||
      !Number.isInteger(r.end) ||
      r.start < 0 ||
      r.end <= r.start ||
      r.end > 50000 ||
      typeof r.quote !== "string" ||
      !r.quote.trim() ||
      r.quote.length !== r.end - r.start
    )
      throw new Error("Invalid highlight text anchor");
    length += r.quote.length;
  }
  if (length > 12000) throw new Error("Highlight selection is too long");
}
export function activeHighlights(
  events: LearningEvent[],
  lessonId: string,
  version: number,
) {
  const latest = new Map<string, HighlightPayload>();
  for (const event of [...events].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id),
  )) {
    if (
      event.payload.activity !== "reading-highlight" ||
      event.payload.lessonId !== lessonId ||
      event.payload.version !== version
    )
      continue;
    try {
      validateHighlightEvent(event);
    } catch {
      continue;
    }
    const payload = event.payload as HighlightPayload;
    latest.set(payload.highlightId, payload);
  }
  return [...latest.values()].filter((p) => p.action === "add");
}
export function highlightedSegments(
  text: string,
  blockId: string,
  highlights: HighlightPayload[],
) {
  const ranges = highlights.flatMap((h) =>
    (h.ranges || [])
      .filter(
        (r) =>
          r.blockId === blockId &&
          r.end <= text.length &&
          text.slice(r.start, r.end) === r.quote,
      )
      .map((r) => ({ ...r, id: h.highlightId })),
  );
  const points = [
    ...new Set([0, text.length, ...ranges.flatMap((r) => [r.start, r.end])]),
  ].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, i) => {
    const end = points[i + 1];
    return {
      start,
      text: text.slice(start, end),
      ids: [
        ...new Set(
          ranges
            .filter((r) => r.start <= start && r.end >= end)
            .map((r) => r.id),
        ),
      ],
    };
  });
}

/** DOM text offsets, rather than innerHTML, keep marks stable across overlap and refresh. */
export function selectionAnchors(
  root: HTMLElement,
  selection: Selection | null,
): TextAnchor[] {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1)
    return [];
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return [];
  const anchors: TextAnchor[] = [];
  for (const block of root.querySelectorAll<HTMLElement>(
    "[data-highlight-block]",
  )) {
    if (!range.intersectsNode(block)) continue;
    const blockRange = document.createRange();
    blockRange.selectNodeContents(block);
    const part = range.cloneRange();
    if (range.compareBoundaryPoints(Range.START_TO_START, blockRange) < 0)
      part.setStart(block, 0);
    if (range.compareBoundaryPoints(Range.END_TO_END, blockRange) > 0)
      part.setEnd(block, block.childNodes.length);
    const quote = part.toString();
    if (!quote.trim()) continue;
    const prefix = document.createRange();
    prefix.selectNodeContents(block);
    prefix.setEnd(part.startContainer, part.startOffset);
    const start = prefix.toString().length;
    anchors.push({
      blockId: block.dataset.highlightBlock!,
      start,
      end: start + quote.length,
      quote,
    });
  }
  return anchors;
}
