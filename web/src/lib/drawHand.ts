import type { Point } from "@/lib/steady";

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export type HandTone = "faint" | "live";

/** Draws the 21 landmarks onto the canvas. Called from the camera loop, so no React render per frame.
 * Landmarks are normalised to the video; the canvas is mirrored with CSS like the video, and sized to cover it.
 */
export function drawHand(canvas: HTMLCanvasElement, video: HTMLVideoElement, landmarks: Point[] | null, tone: HandTone) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!landmarks || landmarks.length < 21) return;
  // object-fit: cover mapping from video pixels to the canvas box.
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const scale = Math.max(w / vw, h / vh);
  const ox = (w - vw * scale) / 2, oy = (h - vh * scale) / 2;
  const px = (p: Point) => [ox + p.x * vw * scale, oy + p.y * vh * scale] as const;
  ctx.globalAlpha = tone === "faint" ? 0.45 : 0.95;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.strokeStyle = tone === "live" ? "#cfe3dc" : "rgba(255,255,255,0.8)";
  ctx.beginPath();
  for (const [a, b] of EDGES) { const [x1, y1] = px(landmarks[a]); const [x2, y2] = px(landmarks[b]); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.stroke();
  ctx.fillStyle = "#fff";
  for (const p of landmarks) { const [x, y] = px(p); ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
}
