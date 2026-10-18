import { useState } from "react";
import { OFFERS_LAPTOP_WEBCAM, OFFERS_PI_CAMERA, saveCameraId } from "@/lib/cameraPref";

/** The Pi-hosted build uses the Pi camera; the Vercel build uses the laptop webcam; dev offers both. */
export function CameraSelect({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  const [selected, setSelected] = useState(value ?? (OFFERS_PI_CAMERA ? "pi-usb" : "local-webcam"));

  return (
    <label className="cam-select" onClick={(e) => e.stopPropagation()}>
      <span className="sr-only">Camera</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h3l2-2.5h8L18 7h3v12H3z" /><circle cx="12" cy="13" r="3.6" /></svg>
      <select
        value={selected}
        onChange={(e) => { setSelected(e.target.value); saveCameraId(e.target.value); onChange(e.target.value); }}
      >
        {OFFERS_LAPTOP_WEBCAM && <option value="local-webcam">Laptop webcam</option>}
        {OFFERS_PI_CAMERA && <option value="pi-usb">Pi USB camera (unit 5)</option>}
      </select>
    </label>
  );
}
