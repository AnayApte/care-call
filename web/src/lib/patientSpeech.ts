export type VoiceState = "off" | "ready" | "elevenlabs" | "browser" | "blocked";

/** Cached server audio through a gesture-unlocked AudioContext; no keys in the browser. */
export function createPatientSpeech(base: string, onState: (state: VoiceState) => void) {
  let context: AudioContext | null = null;
  let enabled = false;
  let generation = 0;
  let source: AudioBufferSourceNode | null = null;
  let queue = Promise.resolve();
  const buffers = new Map<string, AudioBuffer>();
  async function speak(text: string, serial: number) {
    if (!enabled || !context || serial !== generation) { if (serial === generation) onState("blocked"); return; }
    try {
      let buffer = buffers.get(text);
      if (!buffer) {
        const reply = await fetch(`${base.replace(/\/$/, "")}/api/tts`, { method: "POST",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(8000) });
        if (!reply.ok) throw new Error("Voice unavailable");
        buffer = await context.decodeAudioData(await reply.arrayBuffer());
        buffers.set(text, buffer);
      }
      if (serial !== generation) return;
      if (context.state !== "running") throw new Error("Sound blocked");
      onState("elevenlabs");
      await new Promise<void>(resolve => {
        source = context!.createBufferSource(); source.buffer = buffer!; source.connect(context!.destination);
        source.onended = () => { source = null; resolve(); }; source.start();
      });
    } catch {
      if (serial !== generation) return;
      if (!("speechSynthesis" in window)) { onState("blocked"); return; }
      onState("browser");
      await new Promise<void>(resolve => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => resolve();
        utterance.onerror = () => { onState("blocked"); resolve(); };
        window.speechSynthesis.speak(utterance);
      });
    }
  }
  return {
    async enable() {
      try { context ??= new AudioContext(); await context.resume(); enabled = context.state === "running"; onState(enabled ? "ready" : "blocked"); }
      catch { onState("blocked"); }
    },
    say(text: string) { const serial = generation; queue = queue.then(() => speak(text, serial)); },
    stop() { generation++; source?.stop(); window.speechSynthesis?.cancel(); queue = Promise.resolve(); },
  };
}
