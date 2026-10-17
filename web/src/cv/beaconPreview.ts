import { serverBase } from "./deviceAlert";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const url = el<HTMLInputElement>("beacon-server"), start = el<HTMLButtonElement>("beacon-start");
const stop = el<HTMLButtonElement>("beacon-stop"), ack = el<HTMLButtonElement>("beacon-ack");
const word = el("beacon-word"), status = el("beacon-status");
let base = "", running = false, timer: ReturnType<typeof setTimeout> | null = null;
let active: string | null = null;
let generation = 0;

async function poll(epoch: number) {
  try {
    const response = await fetch(`${base}/api/requests?patient_id=p_demo`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Server error (${response.status})`);
    const requests: unknown = await response.json();
    if (!Array.isArray(requests)) throw new Error("Invalid server response");
    if (!running || epoch !== generation) return;
    const latest = requests.find(row => row?.status === "open" && typeof row.id === "string" && /^r_\d+$/.test(row.id));
    active = latest?.id ?? null;
    word.textContent = latest ? String(latest.display ?? "HELP").slice(0, 30).toUpperCase() : "READY";
    word.style.background = latest ? "#f6c7b5" : "white";
    ack.disabled = !active;
    status.textContent = latest ? "Open request on the server. A person should respond." : "No open request shown. This is not a stroke assessment.";
  } catch (error) {
    if (!running || epoch !== generation) return;
    active = null; ack.disabled = true; word.textContent = "OFFLINE";
    status.textContent = error instanceof Error ? error.message : String(error);
  }
  if (running && epoch === generation) timer = setTimeout(() => poll(epoch), 1000);
}
start.onclick = () => {
  try {
    base = serverBase(url.value); running = true; generation++;
    url.disabled = start.disabled = true; stop.disabled = false;
    void poll(generation);
  } catch (error) { status.textContent = (error as Error).message; }
};
function stopPreview() {
  running = false; generation++;
  if (timer) clearTimeout(timer);
  active = null; url.disabled = start.disabled = false; stop.disabled = ack.disabled = true;
  word.textContent = "OFF"; status.textContent = "Preview off.";
}
stop.onclick = stopPreview;
ack.onclick = async () => {
  const requestId = active, epoch = generation;
  if (!requestId) return;
  ack.disabled = true;
  try {
    const response = await fetch(`${base}/api/requests/${requestId}/ack`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ by: "dashboard" }), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Acknowledgement failed (${response.status})`);
    if (running && epoch === generation) {
      status.textContent = "Acknowledged in browser. This does not confirm medical care.";
      word.textContent = "ACKED"; word.style.background = "#dceaf6";
    }
  } catch (error) { if (running && epoch === generation) status.textContent = (error as Error).message; }
};
window.addEventListener("pagehide", stopPreview);
