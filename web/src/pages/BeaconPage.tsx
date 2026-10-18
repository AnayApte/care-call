import RequestInbox from "../components/RequestInbox";
import "./caregiver.css";

export default function BeaconPage() {
  return <main className="caregiver beacon-page">
    <header className="cg-header"><a href="/caregiver" className="cg-brand">Care Call <span> / browser beacon</span></a><a href="/caregiver">Caregiver reports ↗</a></header>
    <RequestInbox beacon />
    <footer className="cg-footer">Browser fallback. This is not a connected Pi. Assistive prototype, not a medical device.</footer>
  </main>;
}
