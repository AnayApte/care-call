import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, PATIENT_ID } from "../lib/api";
import { createRequestsClient, type CareRequest } from "../lib/requests";
import { sounds } from "../lib/sounds";
import { REQUEST_LABELS } from "../cv/patient";
import { DISPLAY_WORD } from "../lib/labels";
import type { Label } from "../cv/types";

type Vote = { request_id: string; correct: boolean; intended_label: string | null };
function RequestCard({ request, online, vote, onAck, onFeedback, busy }: {
  request: CareRequest; online: boolean; vote?: Vote; busy: boolean;
  onAck: () => void; onFeedback: (correct: boolean, intended?: string) => Promise<void>;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [skipped, setSkipped] = useState(false);
  return <article className={`request-card ${request.status === "open" ? "request-open" : "request-answered"}`}>
    <div className="request-top"><div><p className="cg-eyebrow">{request.status === "open" ? "PATIENT REQUEST" : "ANSWERED"}</p><h3>{request.display}</h3></div>
      <time dateTime={request.created_at}>{new Date(request.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
    <p>{request.speech}</p>
    {request.status === "open" ? <button type="button" className="cg-button request-ack" disabled={!online || busy} onClick={onAck}>{busy ? "Sending…" : "I’m coming"}</button>
      : <p className="request-confirmation">Help is on the way · answered {new Date(request.acked_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
    <details className="request-feedback"><summary>Optional: was this understood correctly?</summary>
      <p>Only answer if you know what the patient intended. This does not delay help or change recorded movements.</p>
      {vote ? <p role="status">Saved: {vote.correct ? "Correct" : `Incorrect${vote.intended_label ? ` — intended ${vote.intended_label === "neutral" ? "nothing" : vote.intended_label}` : ""}`}.</p>
        : skipped ? <p role="status">Not sure. No feedback or training change was sent.</p>
        : <div className="request-feedback-actions">
          <button className="cg-button cg-secondary" disabled={!online || busy} onClick={() => { void onFeedback(true, request.label); }}>Correct</button>
          <button className="cg-button cg-secondary" disabled={!online || busy} onClick={() => setCorrecting(true)}>Incorrect</button>
          <button className="cg-button cg-secondary" onClick={() => setSkipped(true)}>Not sure</button>
          {correcting && <div><p>What did the patient mean?</p>{REQUEST_LABELS.filter(label => label !== request.label).map(label =>
            <button key={label} className="cg-button cg-secondary" disabled={!online || busy} onClick={() => { void onFeedback(false, label); }}>{DISPLAY_WORD[label as Label]}</button>)}
            <button className="cg-button cg-secondary" disabled={!online || busy} onClick={() => { void onFeedback(false, "neutral"); }}>Nothing intended</button>
            <button className="cg-button cg-secondary" disabled={!online || busy} onClick={() => { void onFeedback(false); }}>I don’t know the word</button></div>}
        </div>}
    </details>
  </article>;
}

export default function RequestInbox({ beacon = false }: { beacon?: boolean }) {
  const client = useMemo(() => createRequestsClient(API_BASE, PATIENT_ID), []);
  const [requests, setRequests] = useState<CareRequest[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [online, setOnline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [sound, setSound] = useState(false);
  const [busy, setBusy] = useState<string[]>([]);
  const [historyLimit, setHistoryLimit] = useState(5);
  const soundRef = useRef(false);
  const busyRef = useRef(new Set<string>());
  const key = `carecall:seen-alerts:${API_BASE}:${PATIENT_ID}:${beacon ? "beacon" : "caregiver"}`;
  const seen = useRef(new Set<string>());

  useEffect(() => {
    try { seen.current = new Set(JSON.parse(sessionStorage.getItem(key) ?? "[]")); } catch { /* In-memory alerts still work. */ }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const rows = await client.list();
        if (stopped) return;
        const fresh = rows.filter(r => r.status === "open" && !seen.current.has(r.id));
        rows.forEach(r => seen.current.add(r.id));
        try { sessionStorage.setItem(key, JSON.stringify([...seen.current].slice(-500))); } catch { /* Keep this page open to retain alert history. */ }
        if (fresh.length && soundRef.current) sounds.check();
        setRequests(old => rows.map(r => old.find(o => o.id === r.id && o.status === "acked") ?? r));
        setOnline(true); setLoaded(true); setLastUpdate(new Date());
      } catch { if (!stopped) { setOnline(false); setLoaded(true); } }
      if (!stopped) timer = setTimeout(() => { void poll(); }, 1000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [client, key]);
  useEffect(() => {
    let stopped = false;
    void client.feedbackHistory().then(rows => { if (!stopped) setVotes(rows); }).catch(() => { /* Feedback must never block the live inbox. */ });
    return () => { stopped = true; };
  }, [client]);
  const act = useCallback(async (id: string, fn: () => Promise<void>) => {
    if (busyRef.current.has(id)) return;
    busyRef.current.add(id); setBusy([...busyRef.current]); setError("");
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save. Please retry."); }
    finally { busyRef.current.delete(id); setBusy([...busyRef.current]); }
  }, []);
  const open = requests.filter(r => r.status === "open");
  const history = requests.filter(r => r.status === "acked");
  const answered = history.slice(0, historyLimit);
  return <section className={`request-inbox ${beacon ? "beacon-inbox" : ""}`} aria-label="Live requests">
    <div className="request-heading"><div><p className="cg-eyebrow">LIVE REQUESTS</p><h2>{open.length ? `${open.length} waiting for help` : "Waiting for requests"}</h2></div>
      <button className="cg-button cg-secondary" onClick={() => { sounds.unlock(); soundRef.current = !soundRef.current; setSound(soundRef.current); }}>{sound ? "Mute alerts" : "Enable alert sound"}</button></div>
    <p className={`connection ${online ? "connected" : "disconnected"}`} role="status">{!loaded ? "Connecting…" : online ? "Connected · checking every second" : "Connection lost · requests may be out of date"}{lastUpdate && ` · last update ${lastUpdate.toLocaleTimeString()}`}</p>
    {error && <p className="cg-message cg-error" role="alert">{error}</p>}
    <div className="request-list">{[...open, ...answered].map(request => <RequestCard key={request.id} request={request} online={online} busy={busy.includes(request.id)} vote={votes.find(v => v.request_id === request.id)}
      onAck={() => { void act(request.id, async () => {
        const saved = await client.ack(request.id);
        setRequests(rows => rows.map(r => r.id === saved.id ? saved : r));
      }); }}
      onFeedback={(correct, intended) => act(request.id, async () => {
        await client.feedback(request.id, correct, intended);
        setVotes(rows => [...rows.filter(v => v.request_id !== request.id), { request_id: request.id, correct, intended_label: intended ?? null }]);
      })} />)}</div>
    {loaded && !requests.length && <p>No requests yet. Keep this page open while the patient uses their screen.</p>}
    {history.length > historyLimit && <button className="cg-button cg-secondary" onClick={() => setHistoryLimit(n => n + 5)}>Show more answered requests</button>}
  </section>;
}
