import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, PATIENT_ID, type VocabularyItem } from "../lib/api";
import { createAdaptationClient, reviewFrom, settingsFrom, type Job, type Settings, type UsageSession } from "../lib/adaptation";
import { reportPath, reportStore, reportSummary, type SavedReport } from "../lib/reports";
import { displayWord } from "../lib/labels";
import { LABELS } from "../cv/types";
import ReportSummary from "../components/ReportSummary";
import RequestInbox from "../components/RequestInbox";
import "./caregiver.css";

type Phase = "idle" | "starting" | "pending" | "paused";
const REQUEST_LABELS = LABELS.filter(label => label !== "neutral");
const errorText = (e: unknown) => e instanceof Error ? e.message : "Could not reach the server. Try again.";

function loadJob(key: string): Job | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    return raw && typeof raw.id === "string" ? { id: raw.id, base: settingsFrom(raw.base) } : null;
  } catch { return null; }
}

export default function CaregiverPage() {
  const client = useMemo(() => createAdaptationClient(API_BASE, PATIENT_ID), []);
  const savedReports = useMemo(() => reportStore(API_BASE, PATIENT_ID), []);
  const storageKey = `carecall:creao:${API_BASE}:${PATIENT_ID}`;
  const [job, setJob] = useState<Job | null>(() => loadJob(storageKey));
  const [phase, setPhase] = useState<Phase>(() => loadJob(storageKey) ? "pending" : "idle");
  const [current, setCurrent] = useState<Settings | null>(null);
  const [reports, setReports] = useState<UsageSession[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lastReport, setLastReport] = useState<SavedReport | null>(() => savedReports.read());
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const refreshId = useRef(0);
  const refreshing = useRef(false);
  const cancelRefresh = useCallback(() => { refreshId.current++; }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    const id = ++refreshId.current;
    try {
      const [settings, sessions, setup, patient] = await Promise.all([client.current(), client.usage(), client.setup(), client.vocabulary()]);
      if (id !== refreshId.current) return;
      setCurrent(settings); setReports(sessions); setReady(setup.ready); setLoaded(true); setRefreshError(""); setLastUpdate(new Date());
      setVocabulary(patient.vocabulary);
      setLastReport(savedReports.read());
    } catch (e) { if (id === refreshId.current) { setRefreshError(errorText(e)); setLoaded(true); } }
    finally { refreshing.current = false; }
  }, [client, savedReports]);

  useEffect(() => {
    const update = () => { if (!document.hidden) void refresh(); };
    update();
    const timer = window.setInterval(update, 3000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      cancelRefresh(); window.clearInterval(timer);
      window.removeEventListener("focus", update); window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh, cancelRefresh]);
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
        const report: SavedReport = { id: job!.id, job, review: reviewFrom(run, job!.base), outcome: "pending" };
        if (!savedReports.save(report)) throw new Error("The report is ready, but this browser could not save it. Allow site storage, then check the same run again.");
        setLastReport(report); setSummaryOpen(true); setJob(null); setPhase("idle");
      } catch (e) { if (!cancelled) { setError(errorText(e)); setPhase("paused"); } }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [client, job, phase, savedReports]);

  async function start() {
    if (busy.current) return;
    busy.current = true; setPhase("starting"); setError(""); setNotice("");
    try { const next = await client.start(); setCurrent(next.base); setJob(next); setPhase("pending"); }
    catch (e) { setError(errorText(e)); setPhase("idle"); }
    finally { busy.current = false; }
  }
  function dismissWaiting() {
    setJob(null); setPhase("idle"); setError("");
    setNotice("Stopped waiting. Current settings have not changed. The run may still finish in CREAO.");
  }

  const synthetic = reports.some(r => r.synthetic);
  const liveCount = reports.filter(r => r.live).length;
  const summary = lastReport ? reportSummary(lastReport) : null;
  const labels = [...new Set<string>([...REQUEST_LABELS, ...vocabulary.map(w => w.label),
    ...reports.flatMap(r => Object.keys(r.labels))])].filter(label => label !== "neutral");
  const totals = labels.map(label => ({ label,
    attempts: reports.reduce((n, r) => n + (r.labels[label]?.attempts ?? 0), 0),
    fired: reports.reduce((n, r) => n + (r.labels[label]?.fired ?? 0), 0),
  }));
  return <main className="caregiver">
    <header className="cg-header"><a href="/patient" className="cg-brand">Care Call <span> / caregiver</span></a><a href="/patient">Patient screen ↗</a></header>
    <div className="cg-heading"><div><p className="cg-eyebrow">CAREGIVER</p><h1>Caregiver dashboard</h1><p>View requests and recent practice.</p></div>
      <button className="cg-button cg-secondary" onClick={() => { void refresh(); }} disabled={phase === "starting"}>Refresh</button></div>
    {error && <p className="cg-message cg-error" role="alert">{error}</p>}
    {refreshError && <p className="cg-message cg-error" role="alert">Usage updates paused. Showing the last received report. {refreshError}</p>}
    {notice && <p className="cg-message" role="status">{notice}</p>}
    {!loaded && <p role="status">Loading recent practice…</p>}
    <RequestInbox />
    <div className="cg-grid">
      <section className="cg-card"><p className="cg-eyebrow">01 / RECENT PRACTICE</p><h2>The usage report</h2>
        <p>Latest {reports.length} practice sessions{liveCount ? ` · ${liveCount} not yet closed` : ""}. Includes ongoing practice.</p>
        <p className="cg-current">{refreshError ? "Updates paused" : "Updates automatically every few seconds"}{lastUpdate && ` · checked ${lastUpdate.toLocaleTimeString()}`}</p>
        {synthetic && <p className="cg-tag">Includes synthetic demo data</p>}
        <div className="cg-metrics"><div><strong>{totals.reduce((n, x) => n + x.attempts, 0)}</strong><span>movement attempts</span></div><div><strong>{totals.reduce((n, x) => n + x.fired, 0)}</strong><span>requests triggered</span></div></div>
        <table><thead><tr><th>Movement</th><th>Attempts</th><th>Triggered</th></tr></thead><tbody>{totals.map(x => <tr key={x.label}><th>{displayWord(x.label, vocabulary)}</th><td>{x.attempts}</td><td>{x.fired}</td></tr>)}</tbody></table>
        {reports.length ? <details><summary>See session details</summary><pre>{JSON.stringify(reports, null, 2)}</pre></details> : <p>No practice yet. New movement attempts will appear here automatically.</p>}
      </section>
      <section className="cg-card"><p className="cg-eyebrow">02 / YOUR CHOICE</p><h2>Review with CREAO</h2>
        <p>A short summary here. The full explanation and your choices are one click away.</p>
        {loaded && !ready && <p className="cg-message">CREAO is not connected yet. Gesture recognition still works with the current settings.</p>}
        {loaded && ready && <p className="cg-current">CREAO is configured. A review starts only when you ask; settings change only after Apply.</p>}
        {!job && <button className="cg-button" disabled={!ready || !current || phase === "starting" || !reports.length} onClick={() => { void start(); }}>{phase === "starting" ? "Starting review…" : "Ask CREAO to review"}</button>}
        {job && phase === "pending" && <p className="cg-message" role="status">CREAO is reviewing the report. We’ll show a short summary when it’s ready.</p>}
        {job && phase === "paused" && <button className="cg-button" onClick={() => { setError(""); setPhase("pending"); }}>Check the same run again</button>}
        {job && <button className="cg-button cg-secondary" onClick={dismissWaiting}>Stop waiting</button>}
        {lastReport && summary && <div className="report-ready">
          <p className="cg-eyebrow">{lastReport.outcome === "applied" ? "REVIEW APPLIED" : lastReport.outcome === "pending" ? "YOUR REPORT IS READY" : "SAVED REVIEW"}</p>
          <h3>{summary.title}</h3><p>{summary.detail}</p>
          <button className="cg-button cg-secondary" onClick={() => setSummaryOpen(true)}>View summary</button>
          <a className="report-inline-link" href={reportPath(lastReport.id)}>Full report ↗</a>
        </div>}
        {current && <p className="cg-current">Approved settings · version {current.version}<br />{current.hold_frames} hold frames · {Math.round(current.min_confidence * 100)}% match threshold</p>}
      </section>
    </div>
    {lastReport && <ReportSummary report={lastReport} open={summaryOpen} onClose={() => setSummaryOpen(false)} />}
    <footer className="cg-footer">Assistive prototype. This does not diagnose or rule out stroke.</footer>
  </main>;
}
