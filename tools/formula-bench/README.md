# Formula benchmark (P4.4)

From the repository root:

```sh
pnpm bench:formula
```

This defaults to **mock text mode**, using independently scripted responses and local
HyperFormula 3.5.0 (GPLv3). Five first attempts are deliberately wrong. Mock results test
the harness; they are not LLM quality results or evidence for the Phase 5 accuracy gate.
The normal desktop app does not import this evaluator. A commercial evaluator licence
is a separate option, not provided by this repository.

The command prints a Markdown table and writes timestamped `.json` + `.md` reports into
`docs/benchmarks/`. Running it opts into those local reports. Delete unwanted report
files with Finder/Explorer; nothing is uploaded. A nonzero exit means a case still failed
or a run/setup error occurred. Invalid expected formulas fail preflight before requests.

## JSON cases

```json
[
  {
    "id": "sum-en",
    "sheet": {
      "name": "Sheet1",
      "grid": [["Amount"], [10], [20], [30]],
      "targetCell": "B2"
    },
    "utterance": "Add A2 through A4",
    "lang": "en",
    "category": "aggregation",
    "correctionUtterance": "No, use SUM on A2:A4",
    "expected": { "value": 60 }
  }
]
```

Alternatively use `expected: { "acceptedFormulas": ["=SUM(A2:A4)", "=A2+A3+A4"] }`.
Each accepted formula is evaluated, and generated formulas pass by resulting value,
not exact text. Numeric tolerance defaults to 1e-9 absolute + 1e-9 relative; strings,
booleans and null compare strictly. Values are scalar. Equality on one grid does not
prove equivalence on other data; author multiple grids and edge cases.

`sheet` can be a raw grid, defaulting to Sheet1 and output AZ1. Explicit output cells are
recommended. Limits: 2 MB JSON, 1,000 cases, 100 x 50 grid, output within A1:AZ101.
`lang`: en/yue/mixed. `category`: aggregation/lookup/logical/date/text, otherwise
uncategorized. Categories describe the fixture task, not model-reported function names.
`correctionUtterance` may be omitted, in which case a failed case remains failed.
Unknown fields/duplicate IDs/invalid oracle formats are rejected.

```sh
pnpm bench:formula --cases fixtures/formula-cases/p4.4-cases.json --responses fixtures/formula-cases/p4.4-mock-responses.json
```

Response maps key utterances to structured provider responses. They never receive the
case oracle; the fixture generator does not read `expected`. Legacy P4.2 CSV parsing
remains covered by unit tests, but the default evaluator/CLI now uses JSON.

## Live text mode

```sh
pnpm bench:formula --provider live --app-config /absolute/path/to/config.json --config /absolute/path/to/bench-pricing.json
```

This builds a standalone Electron main runner inside this tool's gitignored dist folder.
It requires a working installed Electron runtime from apps/desktop. If the dependency's
runtime binary is missing, repair that existing installation before using live mode.
No Electron window, camera, microphone, native cursor or Excel write is involved.
Live mode makes billable requests when using a paid provider; run it explicitly.

App config uses the existing AppConfig schema. Configure genai.cloudProvider with host,
apiKey and model; put the provider **host:port** in network.allowlist. For local fallback,
enable genai.localProvider and explicitly allow its host:port too. No host is added
implicitly. Redirects are refused. Only packages/genai calls the provider, from Electron
main. Raw API errors, keys and app config are not written to reports.

Benchmark config is optional. Example pricing shape (replace these illustrative zero
rates/model with your provider's actual rates; no real price is implied):

```json
{
  "absoluteTolerance": 1e-9,
  "relativeTolerance": 1e-9,
  "timeoutMs": 30000,
  "pricing": {
    "currency": "USD",
    "asOf": "2026-10-17",
    "cloud": {
      "model": "YOUR_MODEL",
      "inputPerMillion": 0,
      "outputPerMillion": 0
    }
  }
}
```

Add `pricing.local` with the same shape for local token costs; use explicit zero if you
intend zero provider charges. Energy/hardware cost, cache discounts and tax are excluded.
Missing rates/usage, model mismatch or failed potentially billed calls yields N/A. Costs
include internal retries/fallback and the separate correction request. Each row records
cost and token counts; group USD/request averages generation requests, not cases.

Context follows Q15: headers, addresses and types. To include at most five fixture values
per column, explicitly add `--share-samples` on that run. The full grid and expected
answers stay local. The app/benchmark configuration cannot silently enable sharing.

## Optional audio mode

```sh
pnpm models:fetch
pnpm bench:formula --mode audio --cases /absolute/path/to/audio-cases.json
```

Add `audioFile` and, when applicable, `correctionAudioFile` to cases. Paths are relative
to fixtures/audio, for example `sherpa/yue.wav`; WAVs must be mono 16 kHz PCM16/Float32.
Team recordings require an existing consent-manifest entry. The supplied sherpa files
are ASR examples, not a labelled formula quality dataset; no team formula audio exists
currently. Supply independent scripted responses for actual recognized text in mock mode,
or add the live flags to use ASR + real formula generation. No microphone recording or
new audio file is created. Missing audio/model/ASR output is a case failure, not a skip.

## Reading results

- First try: correct first attempts / all cases.
- After correction: first successes plus cases recovered after one correction / all cases.
- First/correction p50/p95: generation through structured response, including internal
  validation retries/fallback, excluding evaluation. Failed requests are included; no
  generation => N/A.
- End-to-end p50/p95: first + correction elapsed time, including evaluator and, in audio
  mode, fixture playback/ASR. Human correction time is not measured.
- Percentiles use nearest rank. Empty groups are N/A. Unknown cost remains unknown.

Unsupported functions, volatile date/random functions, evaluator errors, wrong targets,
timeouts and incorrect values fail. HyperFormula compatibility is not full desktop Excel
compatibility. Reports include case/response SHA-256 hashes for reproducibility.

See docs/decisions/0014-formula-benchmark.md for the architecture and licence decision.
