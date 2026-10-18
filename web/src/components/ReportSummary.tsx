import { useEffect, useRef } from "react";
import { ArrowUpRight, FileCheck2, X } from "lucide-react";
import { reportPath, reportSummary, type SavedReport } from "../lib/reports";
import "./report.css";

export default function ReportSummary({ report, open, onClose }: { report: SavedReport; open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const summary = reportSummary(report);
  useEffect(() => {
    const node = dialog.current;
    if (open && !node?.open) node?.showModal();
    else if (!open && node?.open) node.close();
  }, [open]);
  return <dialog ref={dialog} className="report-popup" aria-labelledby="report-summary-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="report-popup-top"><span className="report-icon"><FileCheck2 size={23} strokeWidth={1.5} /></span>
      <button className="report-close" aria-label="Close summary" onClick={onClose}><X size={20} /></button></div>
    <p className="cg-eyebrow">YOUR PRACTICE REVIEW</p>
    <h2 id="report-summary-title">{summary.title}</h2>
    <p className="report-popup-description">{summary.detail}</p>
    <div className="report-reassurance"><span className="report-dot" />{report.outcome === "applied" ? "These settings have been applied." : report.outcome === "dismissed" ? "Dismissed. Your settings stayed the same." : report.outcome === "readonly" ? "Reading this report does not change your settings." : "Your settings stay the same until you approve."}</div>
    <a className="cg-button report-full-link" href={reportPath(report.id)}>Read full report <ArrowUpRight size={17} /></a>
    <button className="report-later" onClick={onClose}>Close for now</button>
    <p className="report-popup-footnote">Reviewed by CREAO · Demo profile</p>
  </dialog>;
}
