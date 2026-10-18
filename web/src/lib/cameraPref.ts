/** Remembers which webcam the patient screen uses, so a reload keeps the same one. */
const STORAGE_KEY = "carecall.cameraId";

export function loadCameraId(): string | undefined {
  try { return localStorage.getItem(STORAGE_KEY) ?? undefined; } catch { return undefined; }
}

export function saveCameraId(id: string): void {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode: choice lasts this session only */ }
}
