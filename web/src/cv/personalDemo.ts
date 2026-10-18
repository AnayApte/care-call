import { startHandCamera, type HandFrame } from "./camera";
import { loadBundledBaseline } from "./baseline";
import { toModelFeatures } from "./features";
import { createPersonalClassifier } from "./personal";
import { createGestureTrigger } from "./trigger";
import { createSampleCapture } from "./training";
import { LABELS, isLabel, type Sample } from "./types";

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = element<HTMLVideoElement>("video");
const canvas = element<HTMLCanvasElement>("overlay");
const status = element("status"), vectorText = element("vector");
const start = element<HTMLButtonElement>("start"), stop = element<HTMLButtonElement>("stop");
const capture = element<HTMLButtonElement>("capture"), download = element<HTMLButtonElement>("export");
const label = element<HTMLSelectElement>("label");
const progress = element<HTMLProgressElement>("progress");
const baseline = loadBundledBaseline();
element("model-version").textContent = `Hand model: ${baseline.version.replace("baseline_v", "version ")}`;
const personal = createPersonalClassifier(baseline);
const trigger = createGestureTrigger();
let controller: AbortController | null = null;
let collector: ReturnType<typeof createSampleCapture> | null = null;
let samples: Sample[] = [];
let requestCount = 0;

function trainingStatus() {
  const counts = personal.counts();
  element("counts").textContent = LABELS.map(name => `${name}: ${counts[name]}/15`).join(" | ");
  const accuracy = personal.leaveOneOutAccuracy();
  element("accuracy").textContent = accuracy === null ? "Record all five labels to enable recognition."
    : `Leave-one-out training accuracy: ${(accuracy * 100).toFixed(1)}%. Correlated samples from one hold can overstate accuracy; test again with a fresh pose.`;
  element("prediction").textContent = personal.ready() ? "Your request: ready to test." : "Your request: waiting for training.";
  download.disabled = samples.length === 0;
}
trainingStatus();

function stopCamera() {
  controller?.abort(); controller = null; collector = null;
  trigger.reset(); progress.value = 0;
  start.disabled = false; stop.disabled = capture.disabled = true; label.disabled = false;
  canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  vectorText.textContent = "No hand detected.";
  element("baseline").textContent = "General hand shape: camera off.";
  element("prediction").textContent = "Your request: camera off.";
  status.textContent = "Camera off. Training remains in memory until this page reloads.";
}
function onFrame(frame: HandFrame) {
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#50f7c1";
  for (const point of frame.points) {
    ctx.beginPath(); ctx.arc(point.x * canvas.width, point.y * canvas.height, 5, 0, Math.PI * 2); ctx.fill();
  }
  let vector = frame.vector;
  try {
    if (vector) {
      const shape = baseline.classify(toModelFeatures(vector));
      element("baseline").textContent = `General hand shape: ${shape.label} (${Math.round(shape.confidence * 100)}%). This is not a care-request meaning.`;
    } else element("baseline").textContent = "General hand shape: no hand.";
  } catch {
    vector = null;
    element("baseline").textContent = "Hand is too collapsed to read reliably. Reposition it.";
  }
  vectorText.textContent = vector ? `42 features: ${vector.map(x => x.toFixed(3)).join(", ")}` : "No usable hand detected.";
  const wasTraining = collector !== null;
  if (collector) {
    trigger.reset(); progress.value = 0;
    const result = collector.update(vector, frame.timestamp);
    status.textContent = `Holding ${label.value}: ${result.samples.length}/15. Keep holding for three seconds.`;
    if (result.done || result.failed) {
      if (result.done) {
        // Retraining a label replaces its old examples rather than mixing sessions.
        const next = samples.filter(sample => sample.label !== label.value).concat(result.samples);
        personal.setSamples(next);
        samples = next;
        trainingStatus();
      }
      status.textContent = result.done ? `Learned ${label.value}. ${personal.ready() ? "Hold a learned pose to test." : "Choose the next label."}`
        : "Hand lost or camera paused. Retry the full hold.";
      collector = null; label.disabled = false;
    }
  }
  if (!wasTraining) {
    const prediction = vector ? personal.predict(vector) : null;
    element("prediction").textContent = prediction ? `Your request: ${prediction.label} (${Math.round(prediction.confidence * 100)}% neighbor votes)`
      : personal.ready() ? "Your request: no usable prediction." : "Your request: record all five labels first.";
    const state = trigger.update(prediction, frame.timestamp);
    progress.value = state.progress;
    if (state.fired) {
      requestCount++;
      element("request").textContent = `Request ${requestCount}: ${state.fired.label.toUpperCase()} (local preview).`;
    }
    if (state.cooldownMs > 0) status.textContent = `Cooldown: ${(state.cooldownMs / 1000).toFixed(1)} seconds.`;
    else if (personal.ready()) status.textContent = "Recognition active. Hold a learned pose until the progress bar fills.";
  }
  capture.disabled = !vector || collector !== null;
}
start.onclick = async () => {
  start.disabled = true; stop.disabled = false;
  const pending = new AbortController(); controller = pending;
  status.textContent = "Loading hand tracker and requesting camera permission...";
  try {
    await startHandCamera({ video, signal: pending.signal, onFrame, onError(error) {
      stopCamera(); status.textContent = error.message;
    } });
    if (controller === pending) status.textContent = "Camera ready. Put one hand in view.";
  } catch (error) {
    if (controller !== pending) return;
    stopCamera(); status.textContent = error instanceof Error ? error.message : String(error);
  }
};
stop.onclick = stopCamera;
capture.onclick = () => {
  if (!isLabel(label.value)) return;
  trigger.reset(); progress.value = 0;
  collector = createSampleCapture(label.value, performance.now());
  capture.disabled = true; label.disabled = true;
};
element<HTMLButtonElement>("reset").onclick = () => {
  samples = []; collector = null; personal.setSamples([]); trigger.reset();
  progress.value = 0; label.disabled = false; trainingStatus();
  element("request").textContent = "No request triggered.";
  status.textContent = "Personal training cleared. Record neutral and four request labels.";
};
download.onclick = () => {
  const blob = new Blob([JSON.stringify({ simulated: true, feature_format: "wrist-max-2d-xy-42-v1",
    baseline_version: baseline.version, samples }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "simulated-hand-examples.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener("pagehide", stopCamera);
