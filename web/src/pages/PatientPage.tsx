import { useEffect, useRef } from "react";
import { useOnboarding } from "@/hooks/useOnboarding";
import { Deck } from "@/components/patient/Deck";
import { HandCanvas } from "@/components/patient/HandOverlay";
import { Ring, CheckMark } from "@/components/patient/Ring";
import { StepRail } from "@/components/patient/StepRail";
import { TRAINING_ORDER, DISPLAY_WORD } from "@/lib/labels";
import "@/components/patient/patient.css";

export default function PatientPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, start, retrain, dismiss } = useOnboarding(videoRef, canvasRef);
  const { phase, index, countdown, progress, hint, lifting, trigger, result, toast } = state;
  const onboarding = phase !== "listening" && phase !== "loading";
  const deciding = !result && trigger.progress > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space" && result) { e.preventDefault(); dismiss(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, dismiss]);

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
                <button type="button" className="btn-start" onClick={start} autoFocus>Start</button>
                <p className="status">{state.handPresent ? "Ready" : "Waiting for a hand"}<small>{state.handPresent ? "Tap Start when they are ready." : "Bring the hand into the picture."}</small></p>
              </>
            )}
            {phase === "countdown" && (
              <>
                <Ring progress={1 - countdown / 3} mode="countdown">{countdown}</Ring>
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
