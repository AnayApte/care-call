import { createArmCheck, type ArmState } from "./armCheck";
import { createDeviceAlert } from "./deviceAlert";
import { startPoseCamera, type PoseFrame } from "./poseCamera";
import { simulatedArmPose } from "./armSimulation";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = el<HTMLVideoElement>("arm-video"), canvas = el<HTMLCanvasElement>("arm-overlay");
const startCamera = el<HTMLButtonElement>("camera-start"), startCheck = el<HTMLButtonElement>("check-start");
const stopButton = el<HTMLButtonElement>("check-stop"), simulate = el<HTMLButtonElement>("simulate-drop");
const observation = el("observation"), progress = el<HTMLProgressElement>("arm-progress");
const server = el<HTMLInputElement>("alert-server"), enabled = el<HTMLInputElement>("enable-device");
const check = createArmCheck();
let camera: AbortController | null = null, simulationRaf = 0, simulation = false;
let alert: ReturnType<typeof createDeviceAlert> | null = null;
let alertAttempted = false, acknowledgementTimer: ReturnType<typeof setTimeout> | null = null;
let polling = false;

function render(state: ArmState) {
  observation.textContent = state.message;
  observation.style.color = state.phase === "flagged" ? "#a13c18" : "#172d3d";
  progress.value = state.progress;
}
function stopInput() {
  camera?.abort(); camera = null;
  cancelAnimationFrame(simulationRaf); simulation = false;
  startCamera.disabled = false; startCheck.disabled = true; stopButton.disabled = true;
  canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  el("input-mode").textContent = "Camera off.";
  render(check.interrupt());
  if (!alertAttempted) lockServer(false);
}
function lockServer(locked: boolean) { server.disabled = enabled.disabled = locked; }
function begin(now: number) {
  if (alert?.snapshot().status === "sending" || alert?.snapshot().status === "sent" && alert.snapshot().request?.status === "open" || polling) {
    throw new Error("The previous HELP request is still open. Acknowledge it before starting another demo.");
  }
  if (alert?.snapshot().status === "uncertain") throw new Error("Previous alert delivery is unknown. Check the server before reloading or sending another request.");
  alert = enabled.checked ? createDeviceAlert(server.value) : null;
  alertAttempted = false;
  lockServer(true);
  el("alert-status").textContent = alert ? "Armed. A flagged movement will send HELP." : "Preview only. Device alerts are off.";
  render(check.start(now));
}
async function refreshAlert() {
  if (!alert) return;
  const current = alert;
  polling = true;
  try {
    const state = await current.refresh();
    const online = await current.deviceOnline().catch(() => null);
    if (current !== alert) return;
    el("alert-status").textContent = state.message;
    el("device-status").textContent = online === null ? "Device status unavailable." : online ? "A device heartbeat is recent. Physical sound/display not verified." : "No recent device heartbeat. The ESP32 may be offline.";
    if (state.request?.status === "acked") { lockServer(false); return; }
  } catch {
    if (current === alert) el("alert-status").textContent = "Could not refresh acknowledgement. HELP may still be open; check the server.";
  } finally { polling = false; }
  if (current === alert) acknowledgementTimer = setTimeout(refreshAlert, 2000);
}
async function sendHelp(quality: number) {
  if (alertAttempted) return;
  alertAttempted = true;
  if (!alert) { el("alert-status").textContent = "Local HELP preview. Enable device alerts before starting a demo to send it."; lockServer(false); return; }
  el("alert-status").textContent = "Sending HELP...";
  const state = await alert.send(quality);
  el("alert-status").textContent = state.message;
  if (state.status === "sent") void refreshAlert();
  else if (state.status === "failed") lockServer(false);
}
function onFrame(frame: PoseFrame) {
  canvas.width = simulation ? 640 : video.videoWidth || 640;
  canvas.height = simulation ? 480 : video.videoHeight || 480;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "#58edc6"; ctx.fillStyle = "#58edc6"; ctx.lineWidth = 4;
  const links = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
  for (const [a, b] of links) {
    if (!frame.points[a] || !frame.points[b]) continue;
    ctx.beginPath(); ctx.moveTo(frame.points[a].x * canvas.width, frame.points[a].y * canvas.height);
    ctx.lineTo(frame.points[b].x * canvas.width, frame.points[b].y * canvas.height); ctx.stroke();
  }
  for (const i of [11, 12, 13, 14, 15, 16]) {
    if (!frame.points[i]) continue;
    const p = frame.points[i]; ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, 6, 0, Math.PI * 2); ctx.fill();
  }
  const state = check.update(frame.points, frame.timestamp, frame.aspect);
  render(state);
  if (state.phase === "flagged") void sendHelp(state.trackingQuality ?? 0);
  if (["finished", "inconclusive"].includes(state.phase) && !alertAttempted) lockServer(false);
}
startCamera.onclick = async () => {
  stopInput(); startCamera.disabled = true; stopButton.disabled = false;
  const pending = new AbortController(); camera = pending;
  el("input-mode").textContent = "Loading pose tracker and requesting camera permission...";
  try {
    await startPoseCamera({ video, signal: pending.signal, onFrame, onError(error) {
      stopInput(); observation.textContent = error.message;
    } });
    if (camera === pending) { startCheck.disabled = false; el("input-mode").textContent = "Live camera. Video stays on this computer."; }
  } catch (error) {
    if (camera !== pending) return;
    stopInput(); observation.textContent = error instanceof Error ? error.message : String(error);
  }
};
startCheck.onclick = () => { try { begin(performance.now()); } catch (error) { observation.textContent = (error as Error).message; } };
stopButton.onclick = () => { stopInput(); if (!alertAttempted) lockServer(false); };
simulate.onclick = () => {
  try {
    stopInput(); const start = performance.now(); begin(start); simulation = true; stopButton.disabled = false;
    el("input-mode").textContent = "SIMULATION — generated arm points, not a real person.";
    const tick = (now: number) => {
      if (!simulation) return;
      onFrame({ points: simulatedArmPose(now - start < 1500 ? "none" : "left"), timestamp: now, aspect: 4 / 3 });
      if (check.snapshot().phase === "flagged") { simulation = false; return; }
      simulationRaf = requestAnimationFrame(tick);
    };
    simulationRaf = requestAnimationFrame(tick);
  } catch (error) { observation.textContent = (error as Error).message; }
};
el<HTMLButtonElement>("manual-help").onclick = () => {
  render(check.interrupt("Get help directly. If symptoms are sudden or a stroke is suspected, call 911 immediately."));
  try {
    if (!alertAttempted) { alert = enabled.checked ? createDeviceAlert(server.value) : null; lockServer(true); }
    void sendHelp(0); // Manual help has no measured tracking quality or diagnosis score.
  } catch (error) { el("alert-status").textContent = (error as Error).message; }
};
el<HTMLButtonElement>("server-check").onclick = async () => {
  try {
    const online = await createDeviceAlert(server.value).deviceOnline();
    el("device-status").textContent = online ? "Server reached. A device heartbeat is recent." : "Server reached. No recent device heartbeat.";
  } catch { el("device-status").textContent = "Could not reach the server. Check its URL and connection."; }
};
document.addEventListener("visibilitychange", () => { if (document.hidden) render(check.interrupt("Tab hidden. Check incomplete.")); });
window.addEventListener("pagehide", () => { stopInput(); if (acknowledgementTimer) clearTimeout(acknowledgementTimer); });
