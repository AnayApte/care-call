export function StepRail({ total, index }: { total: number; index: number }) {
  return (
    <div className="rail" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < index ? "done" : i === index ? "now" : ""} />
      ))}
    </div>
  );
}
