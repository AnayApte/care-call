import type { ReactNode } from "react";

const CIRCUMFERENCE = 471;

/** Progress ring. `progress` is 0 to 1. `mode` colours the stroke: pine for holding, amber for the countdown, solid disc when done. */
export function Ring({ progress, mode, large, children, small }: {
  progress: number;
  mode: "hold" | "countdown" | "done";
  large?: boolean;
  small?: boolean;
  children?: ReactNode;
}) {
  const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <div className={`ring ${mode === "countdown" ? "countdown" : ""} ${mode === "done" ? "done" : ""} ${large ? "large" : ""}`} aria-label={`${Math.round(progress * 100)} percent`}>
      <svg viewBox="0 0 168 168" aria-hidden="true">
        <circle className="track" cx="84" cy="84" r="75" />
        <circle className="fill" cx="84" cy="84" r="75" style={{ strokeDashoffset: offset }} />
      </svg>
      <div className={`label ${small ? "small" : ""}`}>{children}</div>
    </div>
  );
}

export function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" width="76" height="76" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Saved">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
