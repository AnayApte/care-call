import { RequestError, type CareRequest, type RequestInput, type createRequestsClient } from "../lib/requests";
import type { LocalStore } from "./sessionReporter";
import type { Prediction } from "./types";

export type DeliveryPhase = "ready" | "sending" | "waiting_ack" | "acknowledged" | "waiting_release" | "delivery_unknown" | "failed";
export type DeliveryState = { phase: DeliveryPhase; request: CareRequest | null; input: RequestInput | null; error: string; online: boolean };
type Saved = { input: RequestInput; request: CareRequest | null; sentSpoken: boolean; ackSpoken: boolean; ackSeenAt: number; cooldownUntil: number };

/** One active request per patient screen. Persistence happens before any submission or speech. */
export function createRequestFlow(client: ReturnType<typeof createRequestsClient>, key: string, options: {
  storage?: LocalStore; now?: () => number; speak?: (text: string) => void;
} = {}) {
  const now = options.now ?? Date.now;
  let saved: Saved | null = null;
  try {
    const raw = JSON.parse(options.storage?.getItem(key) ?? "null");
    if (raw?.input && typeof raw.input.client_request_id === "string" &&
        ["water", "pain", "help", "bathroom"].includes(raw.input.label) &&
        Number.isFinite(raw.input.confidence) && raw.input.confidence >= 0 && raw.input.confidence <= 1 &&
        Number.isFinite(raw.cooldownUntil) && Number.isFinite(raw.ackSeenAt) &&
        (!raw.request || (typeof raw.request.id === "string" && ["open", "acked"].includes(raw.request.status)))) saved = raw;
  } catch { /* Invalid stored state never becomes a new request. */ }
  let state: DeliveryState = { phase: saved ? saved.request ? saved.request.status === "acked" ? "waiting_release" : "waiting_ack" : "delivery_unknown" : "waiting_release",
    request: saved?.request ?? null, input: saved?.input ?? null, error: "", online: true };
  let releaseSince: number | null = null;
  let lastFrame = -Infinity;
  let sending = false;
  let polling = false;
  const listeners = new Set<(state: DeliveryState) => void>();
  const persist = () => {
    try {
      if (saved) options.storage?.setItem(key, JSON.stringify(saved));
      else options.storage?.removeItem(key);
    } catch { /* Continue in memory, and clearly disclose the lost reload protection. */
      state = { ...state, error: "Browser storage is unavailable. Keep this page open until help is confirmed." };
    }
  };
  const emit = () => listeners.forEach(listener => listener({ ...state }));
  const update = (patch: Partial<DeliveryState>) => { state = { ...state, ...patch }; emit(); };
  const accept = (request: CareRequest, restored = false) => {
    if (!saved || (saved.request && saved.request.id !== request.id)) return;
    if (typeof request.id !== "string" || !request.id || request.label !== saved.input.label ||
        typeof request.speech !== "string" || !["open", "acked"].includes(request.status)) {
      throw new RequestError("Unexpected request reply. Check the same request again.");
    }
    saved.request = request;
    if (request.status === "acked") {
      if (!saved.ackSeenAt) saved.ackSeenAt = now();
      const speak = !saved.ackSpoken && !restored;
      saved.ackSpoken = true;
      state = { ...state, phase: restored ? "waiting_release" : "acknowledged", request, online: true, error: "" };
      persist(); emit();
      if (speak) options.speak?.("Help is coming.");
    } else {
      const speak = !saved.sentSpoken && !restored;
      saved.sentSpoken = true;
      state = { ...state, phase: "waiting_ack", request, online: true, error: "" };
      persist(); emit();
      if (speak) options.speak?.(request.speech);
    }
  };
  async function submit() {
    if (!saved || sending || !["sending", "delivery_unknown", "failed"].includes(state.phase)) return;
    sending = true;
    update({ phase: "sending", error: "" });
    try { accept(await client.create(saved.input)); }
    catch (e) {
      const knownRejection = e instanceof RequestError && e.status >= 400 && e.status < 500 && e.status !== 408;
      update({ phase: knownRejection ? "failed" : "delivery_unknown", online: false,
        error: e instanceof Error ? e.message : "Could not confirm delivery." });
    } finally { sending = false; }
  }
  return {
    snapshot: () => ({ ...state }),
    subscribe(listener: (state: DeliveryState) => void) { listeners.add(listener); listener({ ...state }); return () => { listeners.delete(listener); }; },
    async fire(label: string, confidence: number) {
      if (state.phase !== "ready") return;
      saved = { input: { label, confidence, client_request_id: crypto.randomUUID() }, request: null,
        sentSpoken: false, ackSpoken: false, ackSeenAt: 0, cooldownUntil: now() + 8000 };
      state = { phase: "sending", request: null, input: saved.input, error: "", online: true };
      releaseSince = null; persist(); emit();
      await submit();
    },
    retry: submit,
    async poll() {
      if (!saved?.request || polling || !["waiting_ack", "acknowledged", "waiting_release"].includes(state.phase)) return;
      if (saved.request.status === "acked") return;
      polling = true;
      try {
        const request = await client.get(saved.request.id);
        if (request.id !== saved.request.id) throw new RequestError("Unexpected request reply. Check again.");
        accept(request);
      } catch (e) { update({ online: false, error: e instanceof Error ? e.message : "Could not check for help." }); }
      finally { polling = false; }
    },
    interrupt() { releaseSince = null; lastFrame = -Infinity; if (state.phase === "ready") update({ phase: "waiting_release" }); },
    observe(prediction: Prediction | null, frameTime: number, fresh = true) {
      if (!fresh || !Number.isFinite(frameTime) || frameTime <= lastFrame) { releaseSince = null; return; }
      if (frameTime - lastFrame > 500) {
        releaseSince = null;
        if (Number.isFinite(lastFrame) && state.phase === "ready") update({ phase: "waiting_release" });
      }
      lastFrame = frameTime;
      if (state.phase === "acknowledged" && saved && now() - saved.ackSeenAt >= 5000) update({ phase: "waiting_release" });
      if (state.phase !== "waiting_release") return;
      if (prediction?.label !== "neutral" || prediction.confidence < .8) { releaseSince = null; return; }
      releaseSince ??= frameTime;
      if (frameTime - releaseSince < 500 || (saved && (now() < saved.cooldownUntil || now() - saved.ackSeenAt < 5000))) return;
      saved = null; persist(); releaseSince = null;
      update({ phase: "ready", input: null, request: null, error: "" });
    },
    /** Demo "continue": acks a still-open request (stops escalation), then listens again without the relax step. */
    async skip(): Promise<{ skipped: boolean; ackError?: string }> {
      const current = saved?.request;
      if (!current || !["waiting_ack", "acknowledged", "waiting_release"].includes(state.phase)) return { skipped: false };
      let ackError: string | undefined;
      if (current.status === "open") {
        try { await client.ack(current.id); }
        catch (e) { ackError = e instanceof Error ? e.message : "Could not mark the request handled."; }
      }
      if (saved?.request?.id !== current.id) return { skipped: false };
      saved = null; persist(); releaseSince = null; lastFrame = -Infinity;
      update({ phase: "ready", input: null, request: null, error: "" });
      return ackError ? { skipped: true, ackError } : { skipped: true };
    },
    recoverFailed() {
      // Only a definite rejection can be set aside. An uncertain delivery keeps its retry key.
      if (state.phase !== "failed") return;
      saved = null; persist(); releaseSince = null;
      update({ phase: "waiting_release", request: null, input: null, error: "" });
    },
  };
}
