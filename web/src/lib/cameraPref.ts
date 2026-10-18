/** Remembers which webcam the patient screen uses, so a reload keeps the same one. */
import { PI_CAMERA, pickCameraId } from "./cameraSource";

const STORAGE_KEY = "carecall.cameraId";
const DEV_STORAGE_KEY = "carecall.dev.cameraId";

/** True on dev and on the Vercel build; false on the Pi-hosted build, which must use the Pi camera. */
export const OFFERS_LAPTOP_WEBCAM = import.meta.env.DEV || import.meta.env.VITE_CAMERA_SOURCE === "webcam";
/** The Pi stream only exists where the Pi serves the page (and in dev, for testing against it). */
export const OFFERS_PI_CAMERA = import.meta.env.DEV || import.meta.env.VITE_CAMERA_SOURCE !== "webcam";

export function loadCameraId(): string {
  const key = import.meta.env.DEV ? DEV_STORAGE_KEY : STORAGE_KEY;
  let stored: string | null = null;
  try { stored = localStorage.getItem(key); } catch { /* private mode: fall back to the default */ }
  const id = pickCameraId({ isDev: import.meta.env.DEV, laptopWebcam: import.meta.env.VITE_CAMERA_SOURCE === "webcam", stored });
  // The Pi-hosted patient screen must use QNX USB camera unit 5, never the Mac browser webcam.
  if (id === PI_CAMERA) { try { localStorage.setItem(key, PI_CAMERA); } catch { /* the Pi source is still the default */ } }
  return id;
}

export function saveCameraId(id: string): void {
  try { localStorage.setItem(import.meta.env.DEV ? DEV_STORAGE_KEY : STORAGE_KEY, id); } catch { /* private mode: choice lasts this session only */ }
}
