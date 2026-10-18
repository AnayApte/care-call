/** Remembers which webcam the patient screen uses, so a reload keeps the same one. */
import { pickCameraId } from "./cameraSource";

const STORAGE_KEY = "carecall.cameraId";
const DEV_STORAGE_KEY = "carecall.dev.cameraId";

export function loadCameraId(): string {
  const key = import.meta.env.DEV ? DEV_STORAGE_KEY : STORAGE_KEY;
  let stored: string | null = null;
  try { stored = localStorage.getItem(key); } catch { /* private mode: fall back to the default */ }
  return pickCameraId({ isDev: import.meta.env.DEV, laptopWebcam: import.meta.env.VITE_CAMERA_SOURCE === "webcam", stored });
}

export function saveCameraId(id: string): void {
  try { localStorage.setItem(import.meta.env.DEV ? DEV_STORAGE_KEY : STORAGE_KEY, id); } catch { /* private mode: choice lasts this session only */ }
}
