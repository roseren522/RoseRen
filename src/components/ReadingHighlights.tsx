import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Highlighter, LoaderCircle, Trash2 } from "lucide-react";
import {
  activeHighlights,
  highlightedSegments,
  selectionAnchors,
  type HighlightPayload,
  type TextAnchor,
} from "../lib/highlights";
import type { LearningEvent } from "../lib/model";

const HighlightContext = createContext<HighlightPayload[]>([]);
export function HighlightedText({
  text,
  blockId,
}: {
  text: string;
  blockId: string;
}) {
  const highlights = useContext(HighlightContext);
  return (
    <span data-highlight-block={blockId}>
      {highlightedSegments(text, blockId, highlights).map((segment) =>
        segment.ids.length ? (
          <mark
            className="personal-reading-highlight"
            data-highlight-ids={segment.ids.join(",")}
            key={segment.start}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={segment.start}>{segment.text}</span>
        ),
      )}
    </span>
  );
}
type Action = { payload: HighlightPayload; eventId: string };
type Menu = { x: number; y: number; ranges: TextAnchor[]; removeIds: string[] };
const intersectingIds = (
  ranges: TextAnchor[],
  highlights: HighlightPayload[],
) =>
  highlights
    .filter((h) =>
      h.ranges?.some((a) =>
        ranges.some(
          (r) => r.blockId === a.blockId && r.start < a.end && r.end > a.start,
        ),
      ),
    )
    .map((h) => h.highlightId);

export function ReadingHighlights({
  lessonId,
  version,
  events,
  saveHighlight,
  children,
}: {
  lessonId: string;
  version: number;
  events: LearningEvent[];
  saveHighlight: (
    payload: HighlightPayload,
    eventId: string,
  ) => Promise<unknown>;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [selection, setSelection] = useState<{
    ranges: TextAnchor[];
    x: number;
    y: number;
  } | null>(null);
  const [saving, setSaving] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const pending = useRef<Action[]>([]),
    lock = useRef(false);
  const highlights = useMemo(
    () => activeHighlights(events, lessonId, version),
    [events, lessonId, version],
  );
  const highlightRef = useRef(highlights);
  highlightRef.current = highlights;
  const position = (x: number, y: number) => ({
    x: Math.max(8, Math.min(x, innerWidth - 248)),
    y: Math.max(8, Math.min(y, innerHeight - 118)),
  });
  useEffect(() => {
    const update = () => {
      if (!root.current) return;
      const current = window.getSelection();
      const ranges = selectionAnchors(root.current, current);
      if (
        !ranges.length ||
        ranges.length > 30 ||
        ranges.reduce((n, r) => n + r.quote.length, 0) > 12000
      ) {
        setSelection(null);
        return;
      }
      const rect = current!.getRangeAt(0).getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) {
        setSelection(null);
        return;
      }
      const point = position(rect.left, rect.bottom + 8);
      setSelection({ ranges, ...point });
    };
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onScroll = () => {
      update();
    };
    const userScroll = () => {
      setMenu(null);
      update();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
        setSelection(null);
      }
      if (
        (event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")) &&
        root.current
      ) {
        const ranges = selectionAnchors(root.current, window.getSelection());
        if (!ranges.length) return;
        event.preventDefault();
        const rect = window
          .getSelection()!
          .getRangeAt(0)
          .getBoundingClientRect();
        setMenu({
          ...position(rect.left, rect.bottom + 8),
          ranges,
          removeIds: intersectingIds(ranges, highlightRef.current),
        });
      }
    };
    document.addEventListener("selectionchange", update);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", userScroll);
    window.addEventListener("wheel", userScroll, {
      passive: true,
      capture: true,
    });
    window.addEventListener("touchmove", userScroll, {
      passive: true,
      capture: true,
    });
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", userScroll);
      window.removeEventListener("wheel", userScroll, true);
      window.removeEventListener("touchmove", userScroll, true);
    };
  }, []);
  useEffect(() => {
    if (menu)
      menuRef.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
  }, [menu]);
  const save = async (actions: Action[]) => {
    if (lock.current) return;
    lock.current = true;
    pending.current = actions;
    setSaving(true);
    setError("");
    setStatus("");
    setMenu(null);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    try {
      for (const action of actions)
        await saveHighlight(action.payload, action.eventId);
      pending.current = [];
      setStatus(
        actions[0]?.payload.action === "remove"
          ? "Highlight removed and saved on this device."
          : "Highlight saved on this device.",
      );
    } catch {
      setError(
        "The highlight change could not be saved. Your previous marks are kept. Retry saving.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const add = (ranges: TextAnchor[]) => {
    const highlightId = crypto.randomUUID();
    void save([
      {
        eventId: crypto.randomUUID(),
        payload: {
          activity: "reading-highlight",
          lessonId,
          version,
          highlightId,
          action: "add",
          ranges,
        },
      },
    ]);
  };
  const remove = (ids: string[]) =>
    void save(
      ids.map((highlightId) => ({
        eventId: crypto.randomUUID(),
        payload: {
          activity: "reading-highlight",
          lessonId,
          version,
          highlightId,
          action: "remove",
        },
      })),
    );
  return (
    <HighlightContext.Provider value={highlights}>
      <div
        className="reading-highlight-layer notranslate"
        lang="en"
        translate="no"
        data-immersive-translate="off"
        ref={root}
        onContextMenu={(event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (target?.closest("textarea,input,[contenteditable=true]")) return;
          const ranges = selectionAnchors(root.current!, window.getSelection());
          const marked = target?.closest<HTMLElement>("[data-highlight-ids]");
          const removeIds = [
            ...new Set([
              ...(marked?.dataset.highlightIds?.split(",") || []),
              ...highlights
                .filter((h) =>
                  h.ranges?.some((a) =>
                    ranges.some(
                      (r) =>
                        r.blockId === a.blockId &&
                        r.start < a.end &&
                        r.end > a.start,
                    ),
                  ),
                )
                .map((h) => h.highlightId),
            ]),
          ];
          if ((!ranges.length && !removeIds.length) || saving) return;
          event.preventDefault();
          if (
            ranges.length > 30 ||
            ranges.reduce((n, r) => n + r.quote.length, 0) > 12000
          ) {
            setError("Select a shorter passage before highlighting.");
            return;
          }
          setMenu({
            ...position(event.clientX, event.clientY),
            ranges,
            removeIds,
          });
        }}
      >
        <div className="reading-highlight-help" lang="en">
          <Highlighter size={14} />
          <span>
            Select passage or question text, then right-click to highlight. On
            mobile, select text and tap Highlight selection.
          </span>
        </div>
        <div
          className="reading-highlight-receipt"
          role={error ? "alert" : "status"}
          lang="en"
        >
          {saving ? (
            <>
              <LoaderCircle size={13} className="spin" /> Saving highlight…
            </>
          ) : error ? (
            <>
              {error}{" "}
              <button
                className="text-button"
                disabled={!pending.current.length}
                onClick={() => void save(pending.current)}
              >
                Retry
              </button>
            </>
          ) : (
            status
          )}
        </div>
        {children}
      </div>
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            className="reading-highlight-menu notranslate"
            lang="en"
            translate="no"
            role="menu"
            aria-label="Text highlight menu"
            style={{ left: menu.x, top: menu.y }}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(event) => {
              const buttons = Array.from(
                menuRef.current?.querySelectorAll<HTMLButtonElement>(
                  "button",
                ) || [],
              );
              const index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (index +
                          (event.key === "ArrowUp" ? -1 : 1) +
                          buttons.length) %
                        buttons.length;
                buttons[next]?.focus();
              }
              if (event.key === "Tab") setMenu(null);
            }}
          >
            {menu.ranges.length > 0 && (
              <button role="menuitem" onClick={() => add(menu.ranges)}>
                <Highlighter size={15} /> Highlight selection
              </button>
            )}
            {menu.removeIds.length > 0 && (
              <button role="menuitem" onClick={() => remove(menu.removeIds)}>
                <Trash2 size={15} /> Remove highlight
              </button>
            )}
          </div>,
          document.body,
        )}
      {selection &&
        !menu &&
        !saving &&
        createPortal(
          <div
            className="reading-selection-action notranslate"
            lang="en"
            translate="no"
            role="group"
            aria-label="Selected text actions"
            style={{ left: selection.x, top: selection.y }}
            onPointerDown={(e) => e.preventDefault()}
          >
            <button
              className="button primary"
              onClick={() => add(selection.ranges)}
            >
              <Highlighter size={15} /> Highlight selection
            </button>
            {intersectingIds(selection.ranges, highlights).length > 0 && (
              <button
                className="button secondary"
                onClick={() =>
                  remove(intersectingIds(selection.ranges, highlights))
                }
              >
                <Trash2 size={15} /> Remove highlight
              </button>
            )}
          </div>,
          document.body,
        )}
    </HighlightContext.Provider>
  );
}
