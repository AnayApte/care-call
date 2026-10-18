import { cardCopy } from "@/lib/labels";
import type { VocabularyItem } from "@/lib/api";
import type { Label } from "@/lib/cv";

/** Flashcard deck: the current label on top, the remaining labels stacked behind, the finished one lifting away. */
export function Deck({ order, vocabulary, index, lifting, hint, done }: {
  order: Label[];
  vocabulary: VocabularyItem[];
  index: number;
  lifting: Label | null;
  hint: string;
  done: boolean;
}) {
  const current = order[index];
  const remaining = order.length - index - 1;
  const copy = cardCopy(current, vocabulary);
  return (
    <div className="deck" aria-live="polite">
      {Array.from({ length: remaining }, (_, i) => remaining - i).map((n) => (
        <div key={`b${n}`} className={`card behind b${n}`} aria-hidden="true"><span /></div>
      ))}
      <div className="card top">
        <p className="step">{index + 1} of {order.length}</p>
        <h2 className="word">{copy.word}</h2>
        {done ? <p className="ask ok">Got it.</p> : <p className="ask">{copy.ask}</p>}
        <p className="hint">{hint}</p>
      </div>
      {lifting && (
        <div key={lifting} className="card lifting" aria-hidden="true">
          <p className="step" />
          <h2 className="word">{cardCopy(lifting, vocabulary).word}</h2>
          <p className="ask ok">Got it.</p>
        </div>
      )}
    </div>
  );
}
