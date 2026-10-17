# Contract change requests (append one line, never edit others' lines)

Format: `YYYY-MM-DD HH:MM | name | what you need changed | why`

2026-10-17 15:39 | josh | Please record Josh's requested working split while Rey handles model training: Josh owns landmarks/features/capture/trigger; classifier boundary is Predictor in web/src/cv/types.ts (42 wrist-max-2D x/y values -> label/confidence or null), page wiring/request API stays with Rey; confirm MediaPipe npm/WASM version and session delivery/retry ownership | Avoid duplicate classifier work and make cross-folder integration explicit; implementation notes in web/src/cv/README.md.

2026-10-17 15:53 | josh | Rey's baseline is on main; please record browser personal kNN using its 32D embeddings via toModelFeatures adapter (middle-MCP scaling + x canonicalization), while stored/wire samples remain max-distance 42D vectors per section 8 | Integrates the completed model without changing shared data or editing ml/; baseline class names never directly map to care requests. Personal labels are learned from captures. See web/src/cv/README.md.
