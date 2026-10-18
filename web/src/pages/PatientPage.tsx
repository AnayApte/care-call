import { useRef } from "react";
import { useOnboarding } from "@/hooks/useOnboarding";
import { Deck } from "@/components/patient/Deck";
import { HandOverlay } from "@/components/patient/HandOverlay";
import { Ring, CheckMark } from "@/components/patient/Ring";
import { StepRail } from "@/components/patient/StepRail";
import { TRAINING_ORDER, DISPLAY_WORD } from "@/lib/labels";
import "@/components/patient/patient.css";

export default function PatientPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { state, landmarks, start, retrain } = useOnboarding(videoRef);
  const { phase, index, countdown, progress, hint, lifting, trigger, lastSent, toast } = state;
  const onboarding = phase !== "listening" && phase !== "loading";
  const liveWord = lastSent ?? trigger.label;

  return (
    <main className="relative h-full overflow-hidden">
      <div className={`cam-frame ${phase === "done" ? "dim" : ""}`}>
        <video ref={videoRef} muted playsInline aria-label="Camera preview, mirrored" />
        <HandOverlay landmarks={landmarks} tone={phase === "holding" || phase === "listening" ? "live" : "faint"} />
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
          <button type="button" className="btn-retrain" onClick={retrain}>Retrain movements</button>
          <h2 className="live-word">{liveWord ? DISPLAY_WORD[liveWord] : "Ready"}</h2>
          <p className="live-sub">{lastSent ? "Request sent. Help is on the way." : liveWord ? "Keep holding to send the request." : "Watching for a movement. Make one and hold it."}</p>
          <div className="live-ring">
            <Ring progress={lastSent ? 1 : trigger.progress} mode={lastSent ? "done" : "hold"} large small>
              {lastSent ? <CheckMark /> : trigger.cooldownMs > 0 ? "Sent" : trigger.label ? "Sending" : ""}
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
