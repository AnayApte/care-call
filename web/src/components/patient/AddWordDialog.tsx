import { useEffect, useRef, useState, type FormEvent } from "react";

type Props = {
  /** Resolves to an error message to show, or null when the word was added. */
  onAdd: (display: string, speech: string) => Promise<string | null>;
  onCancel: () => void;
};

const MAX_WORD = 40;
const MAX_SPEECH = 200;

/** Caregiver form for a new request word. The patient trains the movement for it right after. */
export function AddWordDialog({ onAdd, onCancel }: Props) {
  const [word, setWord] = useState("");
  const [speech, setSpeech] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const wordRef = useRef<HTMLInputElement>(null);
  const suggested = word.trim() ? `I need ${word.trim().toLowerCase()}, please.` : "";

  useEffect(() => { wordRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!word.trim() || isSaving) return;
    setIsSaving(true);
    const message = await onAdd(word, speech.trim() || suggested);
    setIsSaving(false);
    if (message) setError(message);
  };

  return (
    <form className="feedback add-word" role="dialog" aria-modal="true" aria-labelledby="add-word-title"
      onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
      <p id="add-word-title">Add a word</p>
      <label>
        <span>Word on screen</span>
        <input ref={wordRef} value={word} maxLength={MAX_WORD} placeholder="Tea" onChange={(e) => { setWord(e.target.value); setError(null); }} />
      </label>
      <label>
        <span>What the caregiver hears</span>
        <input value={speech} maxLength={MAX_SPEECH} placeholder={suggested || "I need tea, please."} onChange={(e) => setSpeech(e.target.value)} />
      </label>
      {error && <p className="add-word-error" role="alert">{error}</p>}
      <div className="row">
        <button type="submit" className="fb yes" disabled={!word.trim() || isSaving}>{isSaving ? "Adding" : "Add and train"}</button>
        <button type="button" className="fb quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
