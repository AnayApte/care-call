export type HelpRequest = { id: string; label: string; status: "open" | "acked"; acked_by: string | null };
export type AlertState = { status: "idle" | "sending" | "sent" | "failed" | "uncertain"; request: HelpRequest | null; message: string };

export function serverBase(input: string): string {
  const url = new URL(input);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("Use HTTPS or a localhost server");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Enter only the server origin, without credentials or a path");
  return url.origin;
}
function requestShape(raw: unknown): HelpRequest {
  const r = raw as Partial<HelpRequest> | null;
  if (!r || typeof r.id !== "string" || !/^r_\d+$/.test(r.id) || r.label !== "help" ||
      r.status !== "open" && r.status !== "acked") throw new Error("Server returned an invalid help request");
  return { id: r.id, label: r.label, status: r.status, acked_by: typeof r.acked_by === "string" ? r.acked_by : null };
}

/** One attempt per check. Unknown delivery is never automatically retried: the
 * current server has no idempotency key. No API keys or device token in browser.
 */
export function createDeviceAlert(baseInput: string, patientId = "p_demo", fetcher: typeof fetch = fetch) {
  const base = serverBase(baseInput);
  let state: AlertState = { status: "idle", request: null, message: "No alert sent." };
  let pending: Promise<AlertState> | null = null;
  const snapshot = () => ({ ...state, request: state.request ? { ...state.request } : null });
  return {
    snapshot,
    send(trackingQuality: number): Promise<AlertState> {
      if (pending) return pending;
      if (state.status !== "idle") return Promise.resolve(snapshot());
      if (!Number.isFinite(trackingQuality) || trackingQuality < 0 || trackingQuality > 1) throw new Error("Invalid tracking quality");
      state = { status: "sending", request: null, message: "Sending HELP to the server..." };
      pending = (async () => {
        try {
          const response = await fetcher(`${base}/api/requests`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            // confidence here is pose visibility only, NOT probability of stroke.
            body: JSON.stringify({ patient_id: patientId, label: "help", confidence: trackingQuality, source: "browser" }),
            signal: AbortSignal.timeout(8000),
          });
          if (response.status >= 400 && response.status < 500) {
            state = { status: "failed", request: null, message: `Server rejected the alert (${response.status}). Get help directly.` };
          } else if (!response.ok) {
            state = { status: "uncertain", request: null, message: "Server error. Delivery unknown; check the server before sending another alert." };
          } else {
            state = { status: "sent", request: requestShape(await response.json()), message: "HELP stored on the server. Waiting for acknowledgement." };
          }
        } catch {
          state = { status: "uncertain", request: null, message: "Connection failed. Delivery unknown; do not rely on the device alert." };
        } finally { pending = null; }
        return snapshot();
      })();
      return pending;
    },
    async refresh(): Promise<AlertState> {
      if (!state.request) return snapshot();
      const response = await fetcher(`${base}/api/requests?patient_id=${encodeURIComponent(patientId)}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Cannot check acknowledgement (${response.status})`);
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw new Error("Invalid request list");
      const found = rows.find(row => row && typeof row === "object" && row.id === state.request!.id);
      if (!found) throw new Error("Request not found on server");
      state.request = requestShape(found);
      state.message = state.request.status === "acked" ? `Acknowledged via ${state.request.acked_by ?? "caregiver"}. This is not confirmation of medical care.`
        : "HELP stored on the server. Waiting for acknowledgement.";
      return snapshot();
    },
    async deviceOnline(): Promise<boolean> {
      const response = await fetcher(`${base}/api/device/health`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok && response.status !== 503) throw new Error(`Cannot check device (${response.status})`);
      return response.ok;
    },
  };
}
