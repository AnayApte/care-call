import "./brand.css";

export default function Brand({ view }: { view?: string }) {
  return <span className="beacon-brand">
    <img className="beacon-mark" src="/beacon.svg" width="36" height="42" alt="" />
    <span className="beacon-brand-copy"><span className="beacon-wordmark">BEACON</span>
      {view && <span className="beacon-view">{view}</span>}
    </span>
  </span>;
}
