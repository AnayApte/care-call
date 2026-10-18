import { LAPTOP_WEBCAM, PI_CAMERA } from "@/lib/cameraSource";
import { saveCameraId } from "@/lib/cameraPref";

/** Both sources are always offered: the Pi stream only works where the Pi serves the page, so the webcam must stay reachable. */
export function CameraSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <label className="cam-select" onClick={(e) => e.stopPropagation()}>
      <span className="sr-only">Camera</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h3l2-2.5h8L18 7h3v12H3z" /><circle cx="12" cy="13" r="3.6" /></svg>
      <select
        value={value === PI_CAMERA ? PI_CAMERA : LAPTOP_WEBCAM}
        onChange={(e) => { saveCameraId(e.target.value); onChange(e.target.value); }}
      >
        <option value={LAPTOP_WEBCAM}>Laptop webcam</option>
        <option value={PI_CAMERA}>Pi USB camera (unit 5)</option>
      </select>
    </label>
  );
}
