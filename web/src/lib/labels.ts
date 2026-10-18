import type { Label } from "./cv";

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
