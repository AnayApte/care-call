import { useEffect, useRef } from "react";
import { useOnboarding } from "@/hooks/useOnboarding";
import { Deck } from "@/components/patient/Deck";
import { HandCanvas } from "@/components/patient/HandOverlay";
import { Ring, CheckMark } from "@/components/patient/Ring";
import { StepRail } from "@/components/patient/StepRail";
import { TRAINING_ORDER, DISPLAY_WORD } from "@/lib/labels";
import { sounds } from "@/lib/sounds";
import "@/components/patient/patient.css";

export default function PatientPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, retrain, dismiss } = useOnboarding(videoRef, canvasRef);
  const { phase, index, countdown, progress, hint, lifting, trigger, result, toast } = state;
  const onboarding = phase !== "listening" && phase !== "loading";
  const deciding = !result && trigger.progress > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space" && result) { e.preventDefault(); dismiss(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, dismiss]);

  // Browsers only allow sound after a user gesture. Any tap or key on the page unlocks the cues.
  useEffect(() => {
    const unlock = () => sounds.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  return (
    <main className="relative h-full overflow-hidden" onClick={result ? dismiss : undefined}>
      <div className={`cam-frame ${phase === "done" ? "dim" : ""}`}>
        <video ref={videoRef} muted playsInline aria-label="Camera preview, mirrored" />
        <HandCanvas ref={canvasRef} />
      </div>

      {onboarding && (
        <>
          <StepRail total={TRAINING_ORDER.length} index={index} />
          <Deck order={TRAINING_ORDER} index={index} lifting={lifting} hint={hint} done={phase === "done"} />
          <div className="dock">
            {phase === "waiting" && (
              <>
                <Ring progress={0} mode="hold" small>{state.handPresent ? "Found" : ""}</Ring>
                <p className="status">{state.handPresent ? "Hand found" : "Waiting for a hand"}<small>{state.handPresent ? "Starting in a moment. Keep it in the picture." : "Bring the hand into the picture to begin."}</small></p>
              </>
            )}
            {phase === "countdown" && (
              <>
                <Ring progress={progress} mode="countdown">{countdown}</Ring>
                <p className="status">Get ready<small>Recording starts in a moment.</small></p>
              </>
            )}
            {phase === "holding" && (
              <>
                <Ring progress={progress} mode="hold" small>Hold still</Ring>
                <p className="status">Recording<small>If the hand moves a lot, the ring starts over.</small></p>
              </>
            )}
            {phase === "done" && (
              <>
                <Ring progress={1} mode="done"><CheckMark /></Ring>
                <p className="status">Saved<small>{hint}</small></p>
              </>
            )}
          </div>
        </>
      )}

      {phase === "listening" && (
        <>
          <button type="button" className="btn-retrain" onClick={(e) => { e.stopPropagation(); void retrain(); }}>Retrain movements</button>
          <h2 className={`live-word ${result ? "result" : ""}`}>{result ? DISPLAY_WORD[result] : deciding ? "Hold it" : "Ready"}</h2>
          <p className="live-sub">{result ? "Request sent. Tap the screen or press space to continue." : deciding ? "Keep holding while the ring fills." : "Watching for a movement."}</p>
          <div className="live-ring">
            <Ring progress={result ? 1 : trigger.progress} mode={result ? "done" : "hold"} large small>
              {result ? <CheckMark /> : ""}
            </Ring>
          </div>
          <p className="notice">Assistive prototype, not a medical device.</p>
        </>
      )}

      {phase === "loading" && <div className="toast">Starting camera</div>}
      {toast && <div className={`toast ${toast.kind === "error" ? "error" : ""}`} role="status">{toast.text}</div>}
    </main>
  );
}
