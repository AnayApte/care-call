import { useCallback, useEffect, useState } from "react";
import { saveCameraId } from "@/lib/cameraPref";

/** Picks which webcam feeds the hand tracker. Labels are blank until camera permission is granted, so the list
 * refreshes when it is opened and whenever a camera is plugged in or removed. */
export function CameraSelect({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

  const refresh = useCallback(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then((all) => setCameras(all.filter((d) => d.kind === "videoinput" && d.deviceId)))
      .catch(() => setCameras([]));
  }, []);

  useEffect(() => {
    refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", refresh);
  }, [refresh]);

  if (cameras.length === 0) return null;
  const selected = cameras.some((c) => c.deviceId === value) ? value : "";

  return (
    <label className="cam-select" onClick={(e) => e.stopPropagation()}>
      <span className="sr-only">Camera</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h3l2-2.5h8L18 7h3v12H3z" /><circle cx="12" cy="13" r="3.6" /></svg>
      <select
        value={selected}
        onFocus={refresh}
        onPointerDown={refresh}
        onChange={(e) => { saveCameraId(e.target.value); onChange(e.target.value); }}
      >
        {!selected && <option value="">Default camera</option>}
        {cameras.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}
      </select>
    </label>
  );
}
