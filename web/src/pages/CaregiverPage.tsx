import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, PATIENT_ID } from "../lib/api";
import { createAdaptationClient, reviewFrom, settingsFrom, type Job, type Review, type Settings } from "../lib/adaptation";
import { DISPLAY_WORD } from "../lib/labels";
import { LABELS } from "../cv/types";
import { thresholdsFor } from "../cv/adapt";
import type { SessionSummary } from "../cv/session";
import "./caregiver.css";

type Phase = "idle" | "starting" | "pending" | "review" | "applying" | "paused";
const REQUEST_LABELS = LABELS.filter(label => label !== "neutral");
const errorText = (e: unknown) => e instanceof Error ? e.message : "Could not reach the server. Try again.";
const percent = (n: number) => `${Math.round(n * 100)}%`;

function loadJob(key: string): Job | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    return raw && typeof raw.id === "string" ? { id: raw.id, base: settingsFrom(raw.base) } : null;
  } catch { return null; }
}

export default function CaregiverPage() {
  const client = useMemo(() => createAdaptationClient(API_BASE, PATIENT_ID), []);
  const storageKey = `carecall:creao:${API_BASE}:${PATIENT_ID}`;
  const [job, setJob] = useState<Job | null>(() => loadJob(storageKey));
  const [phase, setPhase] = useState<Phase>(() => loadJob(storageKey) ? "pending" : "idle");
  const [current, setCurrent] = useState<Settings | null>(null);
  const [reports, setReports] = useState<SessionSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const refreshId = useRef(0);
  const cancelRefresh = useCallback(() => { refreshId.current++; }, []);

  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    try {
      const [settings, sessions, setup] = await Promise.all([client.current(), client.reports(), client.setup()]);
      if (id !== refreshId.current) return;
      setCurrent(settings); setReports(sessions); setReady(setup.ready); setLoaded(true); setError("");
    } catch (e) { if (id === refreshId.current) { setError(errorText(e)); setLoaded(true); } }
  }, [client]);

  useEffect(() => { void refresh(); return cancelRefresh; }, [refresh, cancelRefresh]);
  useEffect(() => {
    try {
      if (job) localStorage.setItem(storageKey, JSON.stringify(job));
      else localStorage.removeItem(storageKey);
    } catch { /* The current page can still finish if storage is unavailable. */ }
  }, [job, storageKey]);
  useEffect(() => {
    if (!job || phase !== "pending") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    async function poll() {
      try {
        const run = await client.poll(job!);
        if (cancelled) return;
        if (run.status === "pending") {
          if (Date.now() - started > 10 * 60_000) {
            setPhase("paused"); setError("CREAO is taking longer than expected. Check again later. Settings have not changed.");
          } else timer = setTimeout(() => { void poll(); }, 5000);
          return;
        }
        setReview(reviewFrom(run, job!.base)); setPhase("review");
      } catch (e) { if (!cancelled) { setError(errorText(e)); setPhase("paused"); } }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [client, job, phase]);

  async function start() {
    if (busy.current) return;
    busy.current = true; setPhase("starting"); setError(""); setNotice("");
    try { const next = await client.start(); setCurrent(next.base); setJob(next); setPhase("pending"); }
    catch (e) { setError(errorText(e)); setPhase("idle"); }
    finally { busy.current = false; }
  }
  function dismiss() {
    if (busy.current) return;
    setJob(null); setReview(null); setPhase("idle"); setError("");
    setNotice("Suggestion dismissed. Current settings have not changed.");
  }
  async function apply() {
    if (busy.current || !job || !review) return;
    busy.current = true; setPhase("applying"); setError("");
    // Ignore any older Refresh response that could overwrite the saved version.
    refreshId.current++;
    try {
      const saved = await client.apply(job, review);
      setCurrent(saved); setJob(null); setReview(null); setPhase("idle");
      setNotice("Settings applied. The patient screen will pick them up within 30 seconds, between movements.");
    } catch (e) { setError(errorText(e)); setPhase("review"); }
    finally { busy.current = false; }
  }

  const stale = !!job && !!current && job.base.version !== current.version;
  const locked = phase === "starting" || phase === "applying";
  const synthetic = reports.some(r => (r as SessionSummary & { synthetic?: boolean }).synthetic);
  const totals = REQUEST_LABELS.map(label => ({ label,
    attempts: reports.reduce((n, r) => n + (r.labels[label]?.attempts ?? 0), 0),
    fired: reports.reduce((n, r) => n + (r.labels[label]?.fired ?? 0), 0),
  }));
  return <main className="caregiver">
    <header className="cg-header"><a href="/patient" className="cg-brand">Care Call <span> / caregiver</span></a><a href="/patient">Patient screen ↗</a></header>
    <div className="cg-heading"><div><p className="cg-eyebrow">MOVEMENT REVIEW</p><h1>A little easier, together.</h1><p>Review Maria’s recent practice and choose whether to adjust her settings.</p></div>
      <button className="cg-button cg-secondary" onClick={() => { void refresh(); }} disabled={locked}>Refresh</button></div>
    {error && <p className="cg-message cg-error" role="alert">{error}</p>}
    {notice && <p className="cg-message" role="status">{notice}</p>}
    {!loaded && <p role="status">Loading recent practice…</p>}
    <div className="cg-grid">
      <section className="cg-card"><p className="cg-eyebrow">01 / RECENT PRACTICE</p><h2>The usage report</h2>
        <p>Latest {reports.length} saved sessions. A request sends after a movement is held steadily.</p>
        {synthetic && <p className="cg-tag">Includes synthetic demo data</p>}
        <div className="cg-metrics"><div><strong>{totals.reduce((n, x) => n + x.attempts, 0)}</strong><span>movement attempts</span></div><div><strong>{totals.reduce((n, x) => n + x.fired, 0)}</strong><span>requests triggered</span></div></div>
        <table><thead><tr><th>Movement</th><th>Attempts</th><th>Triggered</th></tr></thead><tbody>{totals.map(x => <tr key={x.label}><th>{DISPLAY_WORD[x.label]}</th><td>{x.attempts}</td><td>{x.fired}</td></tr>)}</tbody></table>
        {reports.length ? <details><summary>See saved session details</summary><pre>{JSON.stringify(reports, null, 2)}</pre></details> : <p>No sessions yet. Practice on the patient screen; reports save every ten minutes and when leaving the page.</p>}
      </section>
      <section className="cg-card"><p className="cg-eyebrow">02 / YOUR CHOICE</p><h2>Review with CREAO</h2>
        <p>CREAO reads session summaries and feedback, then suggests adjustments. You decide what to apply.</p>
        {loaded && !ready && <p className="cg-message">CREAO is not connected yet. Gesture recognition still works with the current settings.</p>}
        {!job && <button className="cg-button" disabled={!ready || !current || locked || !reports.length} onClick={() => { void start(); }}>{phase === "starting" ? "Starting review…" : "Ask CREAO to review"}</button>}
        {job && phase === "pending" && <p className="cg-message" role="status">CREAO is reviewing the report. Settings have not changed. You can leave and come back.</p>}
        {job && phase === "paused" && <button className="cg-button" onClick={() => { setError(""); setPhase("pending"); }}>Check the same run again</button>}
        {job && review && <div className="cg-review"><h3>CREAO’s suggestion</h3><p className="cg-explanation">{review.explanation}</p>
          <table><thead><tr><th>Setting</th><th>Current at review</th><th>Suggested</th></tr></thead><tbody>
            <tr><th>Hold frames</th><td>{job.base.hold_frames}</td><td>{review.settings.hold_frames}</td></tr>
            <tr><th>Match threshold</th><td>{percent(job.base.min_confidence)}</td><td>{percent(review.settings.min_confidence)}</td></tr>
            {LABELS.filter(label => job.base.labels[label] || review.settings.labels[label]).map(label => {
              const before = thresholdsFor(job.base, label), after = thresholdsFor(review.settings, label);
              return <tr key={label}><th>{DISPLAY_WORD[label]}</th><td>{before.hold_frames} frames / {percent(before.min_confidence)}</td><td>{after.hold_frames} frames / {percent(after.min_confidence)}</td></tr>;
            })}
          </tbody></table>
          <p className="cg-small">Match thresholds describe agreement with recorded examples, not medical accuracy. At 12 observations per second, 12 frames takes about one second.</p>
          <p><b>Record again:</b> {review.settings.retrain_labels.map(x => DISPLAY_WORD[x]).join(", ") || "None"}. Other recorded movements stay saved.</p>
          {review.settings.suggest_replace.map((x, i) => <p key={`${x.label}-${i}`}><b>Consider changing {DISPLAY_WORD[x.label]}:</b> {x.reason}</p>)}
          {stale && <p className="cg-message cg-error">Settings changed since this review. Dismiss this suggestion and ask for a new one.</p>}
          <button className="cg-button" onClick={() => { void apply(); }} disabled={stale || locked}>{phase === "applying" ? "Applying…" : "Apply these settings"}</button>
        </div>}
        {job && <button className="cg-button cg-secondary" disabled={locked} onClick={dismiss}>Dismiss {review ? "suggestion" : "review"}</button>}
        {job && !review && <p className="cg-small">Dismissing stops this page from waiting. It does not cancel the run in CREAO.</p>}
        {current && <p className="cg-current">Approved settings · version {current.version}<br />{current.hold_frames} hold frames · {percent(current.min_confidence)} match threshold</p>}
      </section>
    </div><footer className="cg-footer">Assistive prototype. This does not diagnose or rule out stroke.</footer>
  </main>;
}
