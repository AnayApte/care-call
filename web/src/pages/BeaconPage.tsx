import RequestInbox from "../components/RequestInbox";
import Brand from "../components/Brand";
import "./caregiver.css";

export default function BeaconPage() {
  return <main className="caregiver beacon-page">
    <header className="cg-header"><a href="/caregiver" className="brand-link" aria-label="Beacon caregiver dashboard"><Brand view="Browser fallback" /></a><a href="/caregiver">Caregiver reports ↗</a></header>
    <RequestInbox beacon />
    <footer className="cg-footer">Browser fallback. This is not a connected Pi. Assistive prototype, not a medical device.</footer>
  </main>;
}
