// Reuse Rey's committed export; do not copy or modify his weights.
import exportedModel from "../../../ml/baseline.json";
import { createBaselineModel, type BaselineModel } from "./model";

export function loadBundledBaseline() {
  return createBaselineModel(exportedModel as BaselineModel);
}
