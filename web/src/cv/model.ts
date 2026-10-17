type DenseLayer = { W: number[][]; b: number[]; act: "relu" | "softmax" };
export type BaselineModel = {
  version: string; input_dim: number; normalisation: string;
  mean: number[]; std: number[]; classes: string[];
  layers: DenseLayer[]; embedding_layer: number;
};

/** Validate once, then run Rey's exported dense layers with plain JavaScript.
 * Input is wrist_relative_v1 (not the persisted max-distance vector).
 */
export function createBaselineModel(model: BaselineModel) {
  const finiteVector = (x: number[], length: number) =>
    Array.isArray(x) && x.length === length && x.every(Number.isFinite);
  if (model.input_dim !== 42 || model.normalisation !== "wrist_relative_v1" ||
      !finiteVector(model.mean, 42) || !finiteVector(model.std, 42) || model.std.some(x => x <= 0) ||
      !Array.isArray(model.classes) || model.classes.length < 2 ||
      model.classes.some(x => typeof x !== "string") || new Set(model.classes).size !== model.classes.length ||
      !Array.isArray(model.layers) || model.layers.length !== 3 || model.embedding_layer !== 1) {
    throw new Error("Unsupported baseline model format");
  }
  let width = 42;
  model.layers.forEach((layer, index) => {
    if (!Array.isArray(layer.W) || layer.W.length === 0 || !finiteVector(layer.b, layer.W.length) ||
        !layer.W.every(row => finiteVector(row, width)) ||
        layer.act !== (index === 2 ? "softmax" : "relu")) throw new Error("Invalid dense layer");
    width = layer.W.length;
  });
  if (width !== model.classes.length || model.layers[1].b.length !== 32) throw new Error("Invalid output dimensions");
  function standardize(input: readonly number[]) {
    if (input.length !== 42 || input.some(x => !Number.isFinite(x))) throw new Error("Expected 42 finite model inputs");
    return input.map((x, i) => Math.fround(Math.fround(Math.fround(x) - Math.fround(model.mean[i])) / Math.fround(model.std[i])));
  }
  function dense(layer: DenseLayer, input: number[]) {
    return layer.W.map((row, i) => {
      const value = Math.fround(row.reduce((sum, weight, j) => sum + Math.fround(weight) * input[j], Math.fround(layer.b[i])));
      return layer.act === "relu" ? Math.max(0, value) : value;
    });
  }
  function embed(input: readonly number[]) {
    let output = standardize(input);
    for (const layer of model.layers.slice(0, 2)) output = dense(layer, output);
    return output;
  }
  function probabilities(input: readonly number[]) {
    const logits = dense(model.layers[2], embed(input));
    const max = Math.max(...logits);
    const exp = logits.map(x => Math.exp(x - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(x => x / sum);
  }
  return {
    version: model.version, embed, probabilities,
    classify(input: readonly number[]) {
      const probs = probabilities(input);
      const best = probs.indexOf(Math.max(...probs));
      return { label: model.classes[best], confidence: probs[best] };
    },
  };
}
export type Baseline = ReturnType<typeof createBaselineModel>;
