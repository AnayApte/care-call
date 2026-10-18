import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { API_BASE, PATIENT_ID } from "../lib/api";
import { createAdaptationClient, reviewFrom, type Settings } from "../lib/adaptation";
import { movementName, reportStore, reportSummary, type SavedReport } from "../lib/reports";
import { thresholdsFor } from "../cv/adapt";
import { LABELS } from "../cv/types";
import ReportText from "../components/ReportText";
import "./caregiver.css";
import "../components/report.css";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const hold = (frames: number) => `${frames} frames`;

export default function CaregiverReportPage({ reportId }: { reportId: string }) {
  const client = useMemo(() => createAdaptationClient(API_BASE, PATIENT_ID), []);
  const savedReports = useMemo(() => reportStore(API_BASE, PATIENT_ID), []);
  const [initial] = useState(() => savedReports.read(reportId));
  const [report, setReport] = useState<SavedReport | null>(initial);
  const [current, setCurrent] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(!initial);
  const [applying, setApplying] = useState(false);
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    void client.current().then(settings => { if (!cancelled) setCurrent(settings); })
      .catch(() => { if (!cancelled) setError("Could not load current settings. You can read the report; Apply is unavailable until you reconnect."); });
    async function read() {
      if (initial) return;
      try {
        const run = await client.poll({ id: reportId });
        if (cancelled) return;
        if (run.status === "pending") {
          if (Date.now() - started > 10 * 60_000) throw new Error("This review is still running. Check again later.");
          timer = setTimeout(() => { void read(); }, 5000); return;
        }
        const completed: SavedReport = { id: reportId, job: null, review: reviewFrom(run), outcome: "readonly" };
        savedReports.save(completed); setReport(completed); setLoading(false);
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : "Could not load this report."); setLoading(false); } }
    }
    void read();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [client, initial, reportId, retry, savedReports]);

  function finish(outcome: "applied" | "dismissed") {
    if (!report) return;
    const updated = { ...report, outcome };
    setReport(updated);
    if (!savedReports.save(updated)) setNotice("Your choice is complete, but this browser could not remember it for next time.");
  }
  async function apply() {
    if (busy.current || !report?.job || report.outcome !== "pending" || !current) return;
    busy.current = true; setApplying(true); setError("");
    try {
      const settings = await client.apply(report.job, report.review);
      setCurrent(settings); finish("applied");
      setNotice("Applied. The patient screen picks up the approved settings within 30 seconds, between movements.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not apply these settings."); }
    finally { busy.current = false; setApplying(false); }
  }
  const base = report?.job?.base;
  const next = report?.review.settings;
  const pending = report?.outcome === "pending" && !!base;
  const stale = pending && current && base!.version !== current.version;
  const summary = report ? reportSummary(report) : null;

  return <main className="caregiver"><div className="report-page">
    <header className="cg-header"><a className="cg-brand" href="/caregiver">Care Call <span> / report</span></a><a href="/caregiver"><ArrowLeft size={14} className="inline" /> Back to caregiver</a></header>
    <div className="report-page-heading"><p className="cg-eyebrow">DETAILED REPORT</p><h1>{summary?.title ?? "Your practice review"}</h1><p>CREAO’s explanation and suggested settings for this demo profile.</p></div>
    {error && <p className="cg-message cg-error" role="alert">{error} <button className="report-inline-link" onClick={() => { setError(""); setLoading(!report); setRetry(n => n + 1); }}>Try again</button></p>}
    {notice && <p className="cg-message" role="status">{notice}</p>}
    {loading && <p role="status">Loading the report… This reopens the same run.</p>}
    {report && next && <div className="report-page-grid">
      <article className="cg-card"><p className="cg-eyebrow">WHY THIS WAS SUGGESTED</p><h2>The report</h2><ReportText text={report.review.explanation} /></article>
      <aside className="cg-card report-setting-card"><p className="cg-eyebrow">YOUR NEXT STEP</p><h2>Suggested adjustments</h2>
        <p className="report-choice-copy">{summary?.detail}</p>
        <table><thead><tr><th>Setting</th>{base && <th>At review</th>}<th>Suggested</th></tr></thead><tbody>
          <tr><th>Hold length</th>{base && <td>{hold(base.hold_frames)}</td>}<td>{hold(next.hold_frames)}</td></tr>
          <tr><th>Match threshold</th>{base && <td>{percent(base.min_confidence)}</td>}<td>{percent(next.min_confidence)}</td></tr>
          {LABELS.filter(label => base?.labels[label] || next.labels[label]).map(label => {
            const before = base && thresholdsFor(base, label), after = thresholdsFor(next, label);
            return <tr key={label}><th>{movementName(label)}</th>{before && <td>{before.hold_frames} frames / {percent(before.min_confidence)}</td>}<td>{after.hold_frames} frames / {percent(after.min_confidence)}</td></tr>;
          })}
        </tbody></table>
        <p className="cg-small">12 frames takes about one second at 12 observations per second. Match scores describe similarity to examples, not medical accuracy.</p>
        <p><strong>Record again:</strong> {next.retrain_labels.map(movementName).join(", ") || "None"}.</p>
        {next.suggest_replace.map((item, i) => <p className="report-choice-copy" key={i}><strong>Consider a different {movementName(item.label)} movement:</strong> {item.reason}</p>)}
        {stale && <p className="cg-message cg-error">Settings changed since this report. Read it here, then request a fresh review to make further changes.</p>}
        {pending && <><button className="cg-button" disabled={!current || !!stale || applying} onClick={() => { void apply(); }}>{applying ? "Applying…" : "Apply these settings"}</button>
          <button className="cg-button cg-secondary" disabled={applying} onClick={() => { if (!busy.current) finish("dismissed"); }}>Dismiss suggestion</button>
          <p className="cg-small">Your other recorded movements stay saved. Nothing changes until you tap Apply.</p></>}
        {report.outcome === "applied" && <p className="report-outcome"><Check size={16} className="inline" /> Applied. This report stays available to read.</p>}
        {report.outcome === "dismissed" && <p className="report-outcome">Dismissed. Settings stayed the same.</p>}
        {report.outcome === "readonly" && <p className="cg-message">This is a read-only copy. To approve changes, open a review requested from this browser on the caregiver screen.</p>}
        <a className="report-inline-link" href="/caregiver">Back to caregiver</a>
      </aside>
    </div>}
    <footer className="cg-footer">Assistive prototype. This does not diagnose or rule out stroke.</footer>
  </div></main>;
}
