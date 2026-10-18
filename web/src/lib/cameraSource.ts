/** Which camera the patient screen starts with. No browser APIs, so it tests in node. */
export const PI_CAMERA = "pi-usb";
export const LAPTOP_WEBCAM = "local-webcam";

/**
 * `laptopWebcam` is true on the Vercel build (`VITE_CAMERA_SOURCE=webcam`): the page runs in a laptop browser and
 * there is no Pi `/camera.mjpg`. The Pi-hosted build leaves it unset and always uses QNX USB camera unit 5.
 */
export function pickCameraId({ isDev, laptopWebcam, stored }: { isDev: boolean; laptopWebcam: boolean; stored: string | null }): string {
  if (isDev) return stored ?? LAPTOP_WEBCAM;
  if (!laptopWebcam) return PI_CAMERA;
  return stored && stored !== PI_CAMERA ? stored : LAPTOP_WEBCAM;
}
