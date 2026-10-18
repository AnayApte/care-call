/** Thin client for the contract API (section 9). Every call returns a Result so a down server never crashes the UI. */
import patientFixture from "../../../shared/fixtures/patient.json";

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";
export const PATIENT_ID = "p_demo";

export type VocabularyItem = { label: string; display: string; speech: string };
export type Patient = { id: string; name: string; vocabulary: VocabularyItem[] };
export type StoredSample = { id: string; patient_id: string; label: string; vector: number[]; created_at: string };
export type CareRequest = {
  id: string; patient_id: string; label: string; display: string; speech: string;
  confidence: number; source: string; status: "open" | "acked"; escalation_level: number;
  created_at: string; acked_at: string | null; acked_by: string | null; ack_latency_ms: number | null;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: body?.error ?? `${res.status} ${res.statusText}` };
    }
    if (res.status === 204) return { ok: true, data: undefined as T };
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export const fixturePatient = patientFixture as Patient;

export const api = {
  getPatient: () => call<Patient>(`/api/patients/${PATIENT_ID}`),
  getSamples: () => call<StoredSample[]>(`/api/patients/${PATIENT_ID}/samples`),
  postSample: (label: string, vector: number[]) =>
    call<StoredSample>(`/api/patients/${PATIENT_ID}/samples`, { method: "POST", body: JSON.stringify({ label, vector }) }),
  deleteSamples: () => call<unknown>(`/api/patients/${PATIENT_ID}/samples`, { method: "DELETE" }),
  /** Contract section 19: the caregiver or patient side marks a request right or wrong. */
  postFeedback: (requestId: string, correct: boolean) =>
    call<unknown>(`/api/requests/${requestId}/feedback`, { method: "POST", body: JSON.stringify({ correct }) }),
  createRequest: (label: string, confidence: number) =>
    call<CareRequest>(`/api/requests`, {
      method: "POST",
      body: JSON.stringify({ patient_id: PATIENT_ID, label, confidence, source: "browser" }),
    }),
};
