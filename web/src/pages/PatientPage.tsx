import { useCallback, useEffect, useRef, useState } from "react";
import { useOnboarding } from "@/hooks/useOnboarding";
import { Deck } from "@/components/patient/Deck";
import { HandCanvas } from "@/components/patient/HandOverlay";
import { Ring, CheckMark } from "@/components/patient/Ring";
import { StepRail } from "@/components/patient/StepRail";
import { displayWord } from "@/lib/labels";
import { USE_MOCK_HAND } from "@/lib/cv";
import { CameraSelect } from "@/components/patient/CameraSelect";
import { AddWordDialog } from "@/components/patient/AddWordDialog";
import { loadCameraId } from "@/lib/cameraPref";
import { sounds } from "@/lib/sounds";
import "@/components/patient/patient.css";
import "@/components/patient/patient-theme.css";

export default function PatientPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraId, setCameraId] = useState(loadCameraId);
  const { state, retrain, dismiss, feedbackYes, feedbackNo, feedbackCorrect, feedbackSkip, retryRequest, enableSound, saveTraining, checkRequest, addWord, skipWord, setPaused } = useOnboarding(videoRef, canvasRef, cameraId);
  const { phase, patient, index, order, canSkip, progress, hint, lifting, trigger, result, flow, feedback, toast } = state;
  const [isAddingWord, setIsAddingWord] = useState(false);
  const requestLabels = patient.vocabulary.map((w) => w.label);
  const openAddWord = () => { setPaused(true); setIsAddingWord(true); };
  const closeAddWord = useCallback(() => { setPaused(false); setIsAddingWord(false); }, [setPaused]);
  const submitWord = async (display: string, speech: string) => {
    const error = await addWord(display, speech);
    if (!error) setIsAddingWord(false);
    return error;
  };
  const onboarding = phase !== "listening" && phase !== "loading";
  const deciding = !result && trigger.progress > 0;

  const delivered = flow.phase === "waiting_ack" || flow.phase === "acknowledged" || !!flow.request;
  const answered = flow.request?.status === "acked";
  const status = result ? flow.phase === "sending" ? "Sending request…"
    : flow.phase === "delivery_unknown" ? "Delivery is unconfirmed. Retry the same request below."
    : flow.phase === "failed" ? "Request rejected. Check the message below."
    : flow.phase === "acknowledged" ? "Help is coming."
    : flow.phase === "waiting_release" ? "Relax your hand. Listening will resume automatically."
    : "Request sent. Waiting for a caregiver."
    : flow.phase === "waiting_release" ? "Show your relaxed movement for a moment to begin."
    : deciding ? "Keep holding while the ring fills." : "Watching for a movement.";

  // Browsers only allow sound after a user gesture. Any tap or key on the page unlocks the cues.
  useEffect(() => {
    const unlock = () => sounds.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  return (
    <main className="patient-design relative h-full overflow-hidden">
      <div className={`cam-frame ${phase === "done" ? "dim" : ""}`}>
        <video ref={videoRef} muted playsInline aria-label="Camera preview, mirrored" />
        <HandCanvas ref={canvasRef} />
      </div>
      <div className="patient-toolbar">
        {!USE_MOCK_HAND && <CameraSelect value={cameraId} onChange={setCameraId} />}
        <div className="patient-tools">
          <button type="button" onClick={() => { void enableSound(); }}>{state.voice === "off" || state.voice === "blocked" ? "Enable sound" : "Enable sound again"}</button>
          <span role="status">{state.voice === "off" ? "Sound is off" : state.voice === "browser" ? "Browser voice fallback" : state.voice === "blocked" ? "Sound blocked — tap Enable sound" : state.voice === "elevenlabs" ? "ElevenLabs audio" : "Sound ready"}</span>
          {state.savingTraining && <button type="button" onClick={() => { void saveTraining(); }}>Retry training save</button>}
        </div>
        <a className="patient-caregiver-link" href="/caregiver" target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>Caregiver screen <span aria-hidden="true">↗</span></a>
        {canSkip && onboarding && phase !== "done" && (
          <div className="live-actions"><button type="button" className="btn-retrain" onClick={skipWord}>Not now</button></div>
        )}
        {phase === "listening" && !result && !isAddingWord && (
          <div className="live-actions">
            <button type="button" className="btn-retrain" onClick={(e) => { e.stopPropagation(); openAddWord(); }}>Add a word</button>
            <button type="button" className="btn-retrain" onClick={(e) => { e.stopPropagation(); void retrain(); }}>Retrain movements</button>
          </div>
        )}
      </div>
      {state.cameraError && <div className="patient-warning" role="alert">{state.cameraError} <button type="button" onClick={() => window.location.reload()}>Reload camera</button></div>}
      {flow.error && <div className="patient-warning delivery-warning" role="alert">{flow.error}
        {(flow.phase === "delivery_unknown" || flow.phase === "failed") && <button type="button" onClick={() => { void retryRequest(); }}>Retry same request</button>}
        {flow.phase === "waiting_ack" && <button type="button" onClick={() => { void checkRequest(); }}>Check for help</button>}
        {flow.phase === "failed" && <button type="button" onClick={dismiss}>Return to listening</button>}
      </div>}

      {onboarding && (
        <>
          <StepRail total={order.length} index={index} />
          <Deck order={order} vocabulary={patient.vocabulary} index={index} lifting={lifting} hint={hint} done={phase === "done"} />
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
          {isAddingWord && <AddWordDialog onAdd={submitWord} onCancel={closeAddWord} />}
          <h2 className={`live-word ${result ? "result" : ""}`}>{result ? displayWord(result, patient.vocabulary) : deciding ? "Hold it" : "Ready"}</h2>
          <p className="live-sub" role="status" aria-live="polite">{status}</p>
          <div className="live-ring">
            <Ring progress={result ? 1 : trigger.progress} mode={answered ? "done" : "hold"} large small>
              {answered ? <CheckMark /> : flow.phase === "sending" ? "Sending" : delivered ? "Sent" : flow.phase === "delivery_unknown" || flow.phase === "failed" ? "Check" : flow.phase === "waiting_release" ? "Relax" : ""}
            </Ring>
          </div>
          {result && flow.request && feedback && feedback !== "done" && (
            <div className="feedback" onClick={(e) => e.stopPropagation()} role="group" aria-label="Was that right">
              {feedback === "asking" ? (
                <>
                  <p>Optional caregiver check</p>
                  <div className="row">
                    <button type="button" className="fb yes" onClick={feedbackYes}>Correct</button>
                    <button type="button" className="fb" onClick={feedbackNo}>Incorrect</button>
                    <button type="button" className="fb quiet" onClick={feedbackSkip}>Not sure</button>
                  </div>
                </>
              ) : (
                <>
                  <p>What did they mean?</p>
                  <div className="row">
                    {requestLabels.filter((l) => l !== result).map((l) => (
                      <button key={l} type="button" className="fb" onClick={() => feedbackCorrect(l)}>{displayWord(l, patient.vocabulary)}</button>
                    ))}
                    <button type="button" className="fb quiet" onClick={() => feedbackCorrect(null)}>Nothing</button>
                  </div>
                </>
              )}
            </div>
          )}
          {result && feedback === "done" && <div className="feedback thanks"><p>Thanks. Help and listening do not depend on this check.</p></div>}
          <p className="notice">{state.accuracy !== null && <>Training check: {Math.round(state.accuracy * 100)}% (leave-one-out).<br /></>}Assistive prototype, not a medical device.</p>
        </>
      )}

      {phase === "loading" && <div className="toast">Starting camera</div>}
      {USE_MOCK_HAND && <p className="toast" style={{ top: "auto", bottom: 56 }}>Simulation: 0 rest, 1 water, 2 pain, 3 help, 4 bathroom, 5 added word, X hide</p>}
      {toast && <div className={`toast ${toast.kind === "error" ? "error" : ""}`} role="status">{toast.text}</div>}
    </main>
  );
}
