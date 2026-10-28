import { useEffect, useRef, useState } from "react";
import { BookPlus, Check, LoaderCircle, X } from "lucide-react";
import type { Entry } from "../lib/model";
import { matchingVocabulary } from "../lib/readingVocabulary";

export default function ReadingVocabulary({
  entry: initial,
  vocabulary,
  onSave,
  onClose,
}: {
  entry: Entry;
  vocabulary: Entry[];
  onSave: (
    entry: Entry,
    entryEventId: string,
    favoriteEventId: string,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [entry, setEntry] = useState(initial);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const ids = useRef({
    entry: crypto.randomUUID(),
    favorite: crypto.randomUUID(),
  });
  const updateEntry = (value: Entry) => {
    // A retry keeps its IDs; an edited response is a new write intent.
    ids.current = { entry: crypto.randomUUID(), favorite: crypto.randomUUID() };
    setEntry(value);
  };
  const existing = matchingVocabulary(entry.term, vocabulary);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal reading-vocabulary-dialog notranslate"
      lang="en"
      translate="no"
      aria-labelledby="reading-vocabulary-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!lock.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id="reading-vocabulary-title">Save a reading word</h2>
        <button
          className="icon-button"
          aria-label="Close word editor"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <form
        className="entry-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (lock.current || !entry.term.trim()) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            await onSave(
              {
                ...entry,
                term: entry.term.trim(),
                meaning: entry.meaning.trim(),
                explanation: entry.meaning.trim(),
                definitionNote: entry.meaning.trim()
                  ? initial.meaning === entry.meaning.trim()
                    ? initial.definitionNote
                    : "Personal English definition; not independently verified."
                  : "Definition pending. Saved reading context is not a dictionary definition.",
              },
              ids.current.entry,
              ids.current.favorite,
            );
            onClose();
          } catch {
            setError(
              "This word could not be saved completely. Your selection and definition are kept here. Please retry.",
            );
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <label>
          Word or short phrase
          <input
            autoFocus
            required
            maxLength={150}
            value={entry.term}
            disabled={busy}
            onChange={(event) =>
              updateEntry({ ...entry, term: event.target.value })
            }
          />
        </label>
        {existing ? (
          <div className="reading-word-existing">
            <Check size={16} />
            <p>
              Already in your vocabulary: <strong>{existing.term}</strong>.
              {existing.meaning && <> {existing.meaning}</>} Saving adds it to
              favorites for later study and keeps its learning history.
            </p>
          </div>
        ) : (
          <label>
            English definition (optional)
            <textarea
              rows={3}
              maxLength={2000}
              value={entry.meaning}
              disabled={busy}
              placeholder="Save the word now, or add a definition you have checked."
              onChange={(event) =>
                updateEntry({ ...entry, meaning: event.target.value })
              }
            />
          </label>
        )}
        <div className="example-block">
          <span className="tiny-label">SAVED READING CONTEXT</span>
          <p>{initial.example}</p>
          <small>{initial.location}</small>
        </div>
        <p className="form-hint">
          New words appear in My vocabulary and all saved words appear in
          Favorites. Words without definitions support context flashcards; add a
          definition later to enable meaning and spelling quizzes.
        </p>
        {error && (
          <p className="reading-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !entry.term.trim()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <BookPlus size={16} />
            )}
            {existing ? "Save for later study" : "Add to vocabulary"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
