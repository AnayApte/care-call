import { useState } from "react";
import { saveCameraId } from "@/lib/cameraPref";

/** Shows the fixed Pi USB camera source used by the tunneled patient app. */
export function CameraSelect({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  const [selected, setSelected] = useState(value ?? "pi-usb");

  return (
    <label className="cam-select" onClick={(e) => e.stopPropagation()}>
      <span className="sr-only">Camera</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h3l2-2.5h8L18 7h3v12H3z" /><circle cx="12" cy="13" r="3.6" /></svg>
      <select
        value={selected}
        onChange={(e) => { setSelected(e.target.value); saveCameraId(e.target.value); onChange(e.target.value); }}
      >
        <option value="pi-usb">Pi USB camera (unit 5)</option>
      </select>
    </label>
  );
}
