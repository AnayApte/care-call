import { useEffect, useRef, type ReactNode } from "react";

const CIRCUMFERENCE = 471;
/** How quickly the drawn ring chases the real progress each animation frame. Lower is smoother and laggier. */
const CHASE = 0.18;

/** Progress ring. `progress` is 0 to 1 and may arrive in uneven steps from the camera loop; the ring eases
 * towards it on every animation frame so the fill looks continuous. `mode` colours the stroke: pine for
 * holding, amber for the countdown, solid disc with an animated check when done. */
export function Ring({ progress, mode, large, children, small }: {
  progress: number;
  mode: "hold" | "countdown" | "done";
  large?: boolean;
  small?: boolean;
  children?: ReactNode;
}) {
  const fillRef = useRef<SVGCircleElement>(null);
  const target = useRef(progress);
  const shown = useRef(progress);
  target.current = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const diff = target.current - shown.current;
      // Snap when within a hair, otherwise chase. A reset to zero also eases down rather than jumping.
      shown.current = Math.abs(diff) < 0.002 ? target.current : shown.current + diff * CHASE;
      if (fillRef.current) fillRef.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - shown.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={`ring ${mode === "countdown" ? "countdown" : ""} ${mode === "done" ? "done" : ""} ${large ? "large" : ""}`} aria-label={`${Math.round(progress * 100)} percent`}>
      <svg viewBox="0 0 168 168" aria-hidden="true">
        <circle className="track" cx="84" cy="84" r="75" />
        <circle ref={fillRef} className="fill" cx="84" cy="84" r="75" style={{ strokeDashoffset: CIRCUMFERENCE * (1 - shown.current) }} />
      </svg>
      <div className={`label ${small ? "small" : ""}`}>{children}</div>
    </div>
  );
}

/** Check mark that draws itself in. Used inside a `done` ring. */
export function CheckMark() {
  return (
    <svg className="check" viewBox="0 0 24 24" width="76" height="76" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Saved">
      <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
    </svg>
  );
}
