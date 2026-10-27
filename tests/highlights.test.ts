import { describe, it, expect } from "vitest";
import {
  activeHighlights,
  highlightedSegments,
  highlightEntryId,
  selectionAnchors,
  type HighlightPayload,
} from "../src/lib/highlights";
import { project, type LearningEvent } from "../src/lib/model";
import { validateBackup } from "../src/lib/import";
import {
  LearningDB,
  persist,
  synchronize,
  type Transport,
} from "../src/lib/store";

const text = "An emissions inventory describes releases.";
const range = {
  blockId: "paragraph:0",
  start: 3,
  end: 22,
  quote: "emissions inventory",
};
function event(
  extra: Partial<HighlightPayload> = {},
  at = "2026-10-27T04:00:00Z",
): LearningEvent {
  const highlightId = extra.highlightId || crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    kind: "entry",
    scope: "alice",
    at,
    entryId: highlightEntryId(highlightId),
    synced: 0,
    payload: {
      activity: "reading-highlight",
      lessonId: "emissions-concentrations",
      version: 1,
      highlightId,
      action: "add",
      ranges: [range],
      ...extra,
    },
  };
}
describe("persistent reading highlights", () => {
  it("replays independent marks and tombstones deterministically without affecting learning progress", () => {
    const first = event(),
      second = event();
    const removed = event(
      {
        action: "remove",
        ranges: undefined,
        highlightId: String(first.payload.highlightId),
      },
      "2026-10-27T05:00:00Z",
    );
    const active = activeHighlights(
      [removed, second, first, first],
      "emissions-concentrations",
      1,
    );
    expect(active.map((h) => h.highlightId)).toEqual([
      second.payload.highlightId,
    ]);
    const state = project([first, second, removed]);
    expect(state.readingHighlights).toHaveLength(3);
    expect(state.entries).toEqual({});
    expect(state.progress).toEqual({});
    expect(state.readingVisits).toHaveLength(0);
    expect(state.readingReviews).toHaveLength(0);
  });
  it("renders overlapping text once and ignores stale anchors or another lesson version", () => {
    const first = event();
    const overlap = event({
      ranges: [
        {
          blockId: "paragraph:0",
          start: 13,
          end: 32,
          quote: text.slice(13, 32),
        },
      ],
    });
    const marks = activeHighlights(
      [first, overlap],
      "emissions-concentrations",
      1,
    );
    const parts = highlightedSegments(text, "paragraph:0", marks);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.some((p) => p.ids.length === 2)).toBe(true);
    expect(
      highlightedSegments("Changed source wording", "paragraph:0", marks).every(
        (p) => !p.ids.length,
      ),
    ).toBe(true);
    expect(activeHighlights([first], "emissions-concentrations", 2)).toEqual(
      [],
    );
  });
  it("validates restored anchors and rejects malformed IDs, offsets, versions and unsafe block identifiers", () => {
    const row = event();
    expect(validateBackup([row], "alice", true)[0].payload).toEqual(
      row.payload,
    );
    for (const patch of [
      { highlightId: "not-a-uuid" },
      { version: "1" },
      { ranges: [] },
      { ranges: [{ ...range, start: -1 }] },
      { ranges: [{ ...range, quote: "Wrong quote length" }] },
      { ranges: [{ ...range, blockId: 'paragraph:0" onclick="bad' }] },
    ])
      expect(() =>
        validateBackup(
          [{ ...row, payload: { ...row.payload, ...patch } }],
          "alice",
          true,
        ),
      ).toThrow();
  });
  it("captures multi-block selections through existing marks without including paragraph labels", () => {
    document.body.innerHTML =
      '<div id="root"><p><span>01</span><span data-highlight-block="paragraph:0">An <mark>emissions</mark> inventory</span></p><p><span>02</span><span data-highlight-block="paragraph:1">Transport matters.</span></p></div>';
    const root = document.querySelector<HTMLElement>("#root")!;
    const first = root.querySelector("mark")!.firstChild!,
      last = root.querySelector(
        '[data-highlight-block="paragraph:1"]',
      )!.firstChild!;
    const selection = window.getSelection()!,
      selected = document.createRange();
    selected.setStart(first, 0);
    selected.setEnd(last, 9);
    selection.removeAllRanges();
    selection.addRange(selected);
    expect(selectionAnchors(root, selection)).toEqual([
      {
        blockId: "paragraph:0",
        start: 3,
        end: 22,
        quote: "emissions inventory",
      },
      { blockId: "paragraph:1", start: 0, end: 9, quote: "Transport" },
    ]);
    selection.removeAllRanges();
    document.body.innerHTML = "";
  });
  it("syncs additions, concurrent independent marks and removal to another isolated account device", async () => {
    const a = new LearningDB("highlight-a-" + crypto.randomUUID()),
      b = new LearningDB("highlight-b-" + crypto.randomUUID());
    try {
      const first = event(),
        second = event();
      await persist(first, a);
      await persist(second, b);
      const remote = new Map<string, LearningEvent>();
      const transport: Transport = {
        async upload(rows) {
          for (const row of rows) {
            expect(row.scope).toBe("alice");
            remote.set(row.id, row);
          }
        },
        async download() {
          return [...remote.values()];
        },
      };
      await synchronize("alice", transport, a);
      await synchronize("alice", transport, b);
      await synchronize("alice", transport, a);
      expect(
        activeHighlights(
          await a.events.toArray(),
          "emissions-concentrations",
          1,
        ),
      ).toHaveLength(2);
      const removal = event(
        {
          action: "remove",
          ranges: undefined,
          highlightId: String(first.payload.highlightId),
        },
        "2026-10-27T05:00:00Z",
      );
      await persist(removal, a);
      await synchronize("alice", transport, a);
      await synchronize("alice", transport, b);
      expect(
        activeHighlights(
          await b.events.toArray(),
          "emissions-concentrations",
          1,
        ),
      ).toHaveLength(1);
      expect(await b.events.where("scope").equals("bob").count()).toBe(0);
    } finally {
      await a.delete();
      await b.delete();
    }
  });
});
