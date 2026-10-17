# Formula benchmark reports

All checked-in reports here are **development harness / transport smoke results**, not
real LLM formula quality measurements. They do not satisfy the Phase 5 accuracy gate.

- [Latest mock text run](formula-mock-text-2026-10-17T15-19-15-671Z.md) ([JSON](formula-mock-text-2026-10-17T15-19-15-671Z.json)): 15 synthetic cases, 10/15 first try, 15/15 after correction. Five English first responses are intentionally wrong in the separate scripted response map; the language difference is scripted, not a model finding.
- [Electron transport smoke run](formula-live-text-2026-10-17T15-15-37-182Z.md) ([JSON](formula-live-text-2026-10-17T15-15-37-182Z.json)): live transport mode against a local stub named `scripted-transport-smoke-NOT-LLM`, 20 requests, no real provider and no charges. Explicit zero token rates are test data.

- [Electron audio transport smoke](formula-live-audio-2026-10-17T15-23-46-257Z.md) ([JSON](formula-live-audio-2026-10-17T15-23-46-257Z.json)): upstream Cantonese ASR sample -> local ASR -> formula router -> local stub -> evaluator. A constant '=1' response tests plumbing only; this is not a formula request or an accuracy dataset.

Earlier timestamped mock runs are intermediate harness snapshots; use the latest run for
the final generation-only latency definition and case hashes. Mock timing measures local
harness overhead, not LLM latency. End-to-end includes evaluator work and any correction.

Run `pnpm bench:formula` to create a new local JSON/Markdown pair. See
[tool usage](../../tools/formula-bench/README.md) and
[evaluator/licence decision](../decisions/0014-formula-benchmark.md). Reports are opt-in
through running the command and can be removed using Finder/Explorer. Nothing is uploaded.
Actual provider and consented formula-audio quality runs remain pending.
