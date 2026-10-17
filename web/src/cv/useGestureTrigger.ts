import { useCallback, useEffect, useRef, useState } from "react";
import { createGestureTrigger, type TriggerState } from "./trigger";
import type { Prediction } from "./types";

/** Rey feeds each new classifier result here and handles the request API in onTrigger.
 * Feed null when a hand disappears; call reset on stop/training/model changes.
 */
export function useGestureTrigger(options: {
  approvedConfig?: unknown;
  onTrigger: (event: NonNullable<TriggerState["fired"]>) => void;
}) {
  const engine = useRef<ReturnType<typeof createGestureTrigger> | null>(null);
  if (!engine.current) engine.current = createGestureTrigger(options.approvedConfig);
  const callback = useRef(options.onTrigger);
  callback.current = options.onTrigger;
  const [state, setState] = useState<TriggerState>({ label: null, progress: 0, cooldownMs: 0, fired: null });
  const reset = useCallback(() => {
    engine.current!.reset();
    setState(old => ({ ...old, label: null, progress: 0, fired: null }));
  }, []);
  useEffect(() => { engine.current!.setConfig(options.approvedConfig); reset(); }, [options.approvedConfig, reset]);
  useEffect(() => {
    const hide = () => { if (document.hidden) reset(); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [reset]);
  const processPrediction = useCallback((prediction: Prediction | null, timestamp: number) => {
    const next = engine.current!.update(prediction, timestamp);
    setState(next);
    if (next.fired) callback.current(next.fired);
    return next;
  }, []);
  return { ...state, processPrediction, reset };
}
