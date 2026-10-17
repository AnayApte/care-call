import { startHandCamera, type HandFrame } from "./camera";
import { createSampleCapture } from "./training";
import { isLabel, type Sample } from "./types";

const video = document.querySelector<HTMLVideoElement>("#video")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
const status = document.querySelector<HTMLElement>("#status")!;
const vectorText = document.querySelector<HTMLElement>("#vector")!;
const start = document.querySelector<HTMLButtonElement>("#start")!;
const stop = document.querySelector<HTMLButtonElement>("#stop")!;
const capture = document.querySelector<HTMLButtonElement>("#capture")!;
const download = document.querySelector<HTMLButtonElement>("#export")!;
const label = document.querySelector<HTMLSelectElement>("#label")!;
let controller: AbortController | null = null;
let collector: ReturnType<typeof createSampleCapture> | null = null;
const samples: Sample[] = [];

function stopCamera() {
  controller?.abort();
  controller = null;
  collector = null;
  start.disabled = false;
  stop.disabled = capture.disabled = true;
  label.disabled = false;
  canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  vectorText.textContent = "No hand detected.";
  status.textContent = "Camera off.";
}
function onFrame(frame: HandFrame) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#50f7c1";
  for (const point of frame.points) {
    ctx.beginPath(); ctx.arc(point.x * canvas.width, point.y * canvas.height, 5, 0, Math.PI * 2); ctx.fill();
  }
  vectorText.textContent = frame.vector ? `42 features: ${frame.vector.map(x => x.toFixed(3)).join(", ")}` : "No hand detected.";
  if (collector) {
    const result = collector.update(frame.vector, frame.timestamp);
    status.textContent = `Holding ${label.value}: ${result.samples.length}/15 samples. Keep holding for 3 seconds.`;
    if (result.done || result.failed) {
      if (result.done) samples.push(...result.samples);
      status.textContent = result.done ? `Captured 15 ${label.value} examples. Total: ${samples.length}.` : "Hand lost or camera paused. Retry the full hold.";
      collector = null;
      label.disabled = false;
      download.disabled = samples.length === 0;
    }
  }
  capture.disabled = !frame.vector || collector !== null;
}
start.onclick = async () => {
  start.disabled = true;
  stop.disabled = false;
  const pending = new AbortController();
  controller = pending;
  status.textContent = "Loading hand tracker and requesting camera permission...";
  try {
    await startHandCamera({ video, signal: pending.signal, onFrame, onError(error) {
      stopCamera(); status.textContent = error.message;
    } });
    if (controller === pending) status.textContent = "Camera ready. Put one hand in view.";
  } catch (error) {
    if (controller !== pending) return;
    stopCamera();
    status.textContent = error instanceof Error ? error.message : String(error);
  }
};
stop.onclick = stopCamera;
capture.onclick = () => {
  if (!isLabel(label.value)) return;
  collector = createSampleCapture(label.value, performance.now());
  capture.disabled = true;
  label.disabled = true;
};
download.onclick = () => {
  const blob = new Blob([JSON.stringify({ simulated: true, feature_format: "wrist-max-2d-xy-42-v1", samples }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "simulated-hand-examples.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener("pagehide", stopCamera);
