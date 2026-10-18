/** Which camera the patient screen starts with. No browser APIs, so it tests in node. */
export const PI_CAMERA = "pi-usb";
export const LAPTOP_WEBCAM = "local-webcam";

/**
 * `laptopWebcam` is true on the Vercel build (`VITE_CAMERA_SOURCE=webcam`): the page runs in a laptop browser and
 * there is no Pi `/camera.mjpg`. Other builds default to QNX USB camera unit 5 but keep a stored webcam choice,
 * and the patient page falls back to the webcam when the Pi stream fails to load.
 */
export function pickCameraId({ isDev, laptopWebcam, stored }: { isDev: boolean; laptopWebcam: boolean; stored: string | null }): string {
  if (isDev) return stored ?? LAPTOP_WEBCAM;
  if (!laptopWebcam) return stored ?? PI_CAMERA;
  return stored && stored !== PI_CAMERA ? stored : LAPTOP_WEBCAM;
}
