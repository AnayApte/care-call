/** Tiny synthesised cues, no audio assets. A soft tick for the countdown, a two-note check when a label saves. */
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, startIn: number, length: number, gain = 0.12) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = ac.currentTime + startIn;
  vol.gain.setValueAtTime(0, t0);
  vol.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  osc.connect(vol).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.05);
}

export const sounds = {
  tick: () => tone(880, 0, 0.08, 0.06),
  check: () => { tone(660, 0, 0.18); tone(990, 0.12, 0.28); },
  /** Call once from a user gesture so the browser lets audio play later. */
  unlock: () => { audio(); },
};
