/** Remembers which hand the patient trained with, so a reload keeps listening to the same one. The value is
 * MediaPipe's label, which may be mirrored relative to what the person would say. Never show it as a side. */
import type { Handedness } from "./handArbiter";

const STORAGE_KEY = "carecall.handedness";

export function loadHandedness(): Handedness | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "Left" || v === "Right" ? v : null;
  } catch { return null; }
}

export function saveHandedness(h: Handedness | null): void {
  try {
    if (h) localStorage.setItem(STORAGE_KEY, h);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* private mode: lock lasts this session only */ }
}
