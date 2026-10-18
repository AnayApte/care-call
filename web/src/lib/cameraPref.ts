/** Remembers which webcam the patient screen uses, so a reload keeps the same one. */
const STORAGE_KEY = "carecall.cameraId";

export function loadCameraId(): string | undefined {
  // The Pi-hosted patient screen must use QNX USB camera unit 5, never the Mac browser webcam.
  try { localStorage.setItem(STORAGE_KEY, "pi-usb"); } catch { /* the Pi source is still the default */ }
  return "pi-usb";
}

export function saveCameraId(id: string): void {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode: choice lasts this session only */ }
}
