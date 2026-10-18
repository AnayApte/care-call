import { useEffect, useRef } from "react";
import { useOnboarding } from "@/hooks/useOnboarding";
import { Deck } from "@/components/patient/Deck";
import { HandCanvas } from "@/components/patient/HandOverlay";
import { Ring, CheckMark } from "@/components/patient/Ring";
import { StepRail } from "@/components/patient/StepRail";
import { TRAINING_ORDER, DISPLAY_WORD } from "@/lib/labels";
import { REQUEST_LABELS } from "@/lib/cv";
import { sounds } from "@/lib/sounds";
import { USE_MOCK_HAND } from "@/lib/cv";
import "@/components/patient/patient.css";

export default function PatientPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, retrain, dismiss, feedbackYes, feedbackNo, feedbackCorrect } = useOnboarding(videoRef, canvasRef);
  const { phase, index, progress, hint, lifting, trigger, result, feedback, toast } = state;
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
                <Ring progress={progress} mode="countdown" small>Get ready</Ring>
                <p className="status">Hand found<small>Recording starts in a moment. Make the movement now.</small></p>
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
          <p className="live-sub">{result ? "Request sent. Waiting for a caregiver. Tap the screen or press space to continue." : deciding ? "Keep holding while the ring fills." : "Watching for a movement."}</p>
          <div className="live-ring">
            <Ring progress={result ? 1 : trigger.progress} mode={result ? "done" : "hold"} large small>
              {result ? <CheckMark /> : ""}
            </Ring>
          </div>
          {result && feedback && feedback !== "done" && (
            <div className="feedback" onClick={(e) => e.stopPropagation()} role="group" aria-label="Was that right">
              {feedback === "asking" ? (
                <>
                  <p>Was that the right request?</p>
                  <div className="row">
                    <button type="button" className="fb yes" onClick={feedbackYes}>Yes</button>
                    <button type="button" className="fb" onClick={feedbackNo}>No</button>
                  </div>
                </>
              ) : (
                <>
                  <p>What did they mean?</p>
                  <div className="row">
                    {REQUEST_LABELS.filter((l) => l !== result).map((l) => (
                      <button key={l} type="button" className="fb" onClick={() => feedbackCorrect(l)}>{DISPLAY_WORD[l]}</button>
                    ))}
                    <button type="button" className="fb quiet" onClick={() => feedbackCorrect("neutral")}>Nothing</button>
                  </div>
                </>
              )}
            </div>
          )}
          {result && feedback === "done" && <div className="feedback thanks"><p>Thanks. The model learned from that. Tap or press space to continue.</p></div>}
          <p className="notice">{state.accuracy !== null && <>Training check: {Math.round(state.accuracy * 100)}% (leave-one-out).<br /></>}Assistive prototype, not a medical device.</p>
        </>
      )}

      {phase === "loading" && <div className="toast">Starting camera</div>}
      {USE_MOCK_HAND && <p className="toast" style={{ top: "auto", bottom: 56 }}>Simulation: 0 rest, 1 water, 2 pain, 3 help, 4 bathroom, X hide</p>}
      {toast && <div className={`toast ${toast.kind === "error" ? "error" : ""}`} role="status">{toast.text}</div>}
    </main>
  );
}
