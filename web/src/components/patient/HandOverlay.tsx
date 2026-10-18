import { forwardRef } from "react";

export const HandCanvas = forwardRef<HTMLCanvasElement>(function HandCanvas(_, ref) {
  return <canvas ref={ref} className="hand" aria-hidden="true" />;
});
