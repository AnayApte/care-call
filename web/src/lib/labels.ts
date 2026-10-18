import type { Label } from "./cv";
import type { VocabularyItem } from "./api";

/** Training order and the caregiver-voice copy for each card. Neutral first so the rhythm is learned on the easiest one. */
export const TRAINING_ORDER: Label[] = ["neutral", "water", "pain", "help", "bathroom"];

export const CARD_COPY: Record<Label, { word: string; ask: string }> = {
  neutral: { word: "Rest", ask: "Have your patient rest their hand the way they normally hold it." },
  water: { word: "Water", ask: "Ask them to make their movement for water, and hold it." },
  pain: { word: "Pain", ask: "Ask them to make their movement for pain, and hold it." },
  help: { word: "Help", ask: "Ask them to make their movement for help, and hold it." },
  bathroom: { word: "Bathroom", ask: "Ask them to make their movement for bathroom, and hold it." },
};

export const DISPLAY_WORD: Record<Label, string> = {
  neutral: "Rest", water: "Water", pain: "Pain", help: "Help", bathroom: "Bathroom",
};

/** Same rule as `LABEL_PATTERN` in `cv/types.ts` and `VocabularyIn` on the server. */
const MAX_LABEL_LENGTH = 24;

/** "Cup of tea!" -> "cup_of_tea". Empty when no label starting with a letter is left. */
export function toLabel(word: string): string {
  const label = word.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, MAX_LABEL_LENGTH).replace(/_+$/, "");
  return /^[a-z]/.test(label) ? label : "";
}

/** The default words, then any word the patient added after onboarding, in the order they were added. */
export function trainingOrder(vocabulary: readonly VocabularyItem[]): Label[] {
  const added = vocabulary.map((w) => w.label).filter((l) => !TRAINING_ORDER.includes(l));
  return [...TRAINING_ORDER, ...new Set(added)];
}

export function displayWord(label: Label, vocabulary: readonly VocabularyItem[]): string {
  return DISPLAY_WORD[label] ?? vocabulary.find((w) => w.label === label)?.display ?? label;
}

export function cardCopy(label: Label, vocabulary: readonly VocabularyItem[]): { word: string; ask: string } {
  if (CARD_COPY[label]) return CARD_COPY[label];
  const word = displayWord(label, vocabulary);
  return { word, ask: `Ask them to make their movement for ${word.toLowerCase()}, and hold it.` };
}
