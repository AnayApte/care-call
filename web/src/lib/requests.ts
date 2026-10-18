export type CareRequest = {
  id: string; patient_id: string; label: string; display: string; speech: string;
  confidence: number; source: string; status: "open" | "acked"; escalation_level: number;
  created_at: string; acked_at: string | null; acked_by: string | null; ack_latency_ms: number | null;
};
export type RequestInput = { label: string; confidence: number; client_request_id: string };
export class RequestError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

export function createRequestsClient(base: string, patientId: string) {
  async function call<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
        method: body === undefined ? "GET" : method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000),
      });
    } catch { throw new RequestError("Cannot reach the server. Check the connection and retry."); }
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new RequestError(error?.error ?? `Request failed (${response.status})`, response.status);
    }
    try { return await response.json() as T; }
    catch { throw new RequestError("The server reply was incomplete. Check again."); }
  }
  return {
    create: (input: RequestInput) => call<CareRequest>("/api/requests", { ...input, patient_id: patientId, source: "browser" }),
    get: (id: string) => call<CareRequest>(`/api/requests/${encodeURIComponent(id)}`),
    list: () => call<CareRequest[]>(`/api/requests?patient_id=${encodeURIComponent(patientId)}`),
    ack: (id: string) => call<CareRequest>(`/api/requests/${encodeURIComponent(id)}/ack`, { by: "dashboard" }),
    feedback: (id: string, correct: boolean, intendedLabel?: string) => call<unknown>(
      `/api/requests/${encodeURIComponent(id)}/feedback`, { correct, intended_label: intendedLabel }),
    feedbackHistory: () => call<{ request_id: string; correct: boolean; intended_label: string | null }[]>(
      `/api/patients/${encodeURIComponent(patientId)}/feedback`),
  };
}
