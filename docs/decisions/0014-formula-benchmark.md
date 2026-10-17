# 0014: Value-based formula benchmark

Date: 2026-10-17. Step: P4.4.

## Evaluator and licence

Use HyperFormula **3.5.0**, pinned in tools/formula-bench, under **GPLv3** with
`licenseKey: 'gpl-v3'`. Its installed LICENSE.txt states GPLv3 or a separately purchased
proprietary licence. The human approved the GPLv3 dependency before installation.
The evaluator is used by the benchmark tool; the normal desktop build does not import
it. This separation does not waive GPL obligations when distributing the tool or a
combined derivative. No project-wide licence is changed or commercial licence assumed.

HyperFormula is JavaScript without a platform-specific evaluator addon. The same code
runs on macOS and Windows; macOS unit/build/transport checks are recorded in PROGRESS,
and a Windows runtime check remains for the teammate. esbuild is reused at the repo's
existing 0.25 line as a tool dev dependency to build a separate Electron main runner.

## Cases and scoring

The core Zod schema accepts JSON arrays of cases: id, sheet, utterance, lang,
correctionUtterance (optional), expected, and optional category/audio paths. A sheet is
an explicit { name, grid, targetCell } object, or a raw grid (Sheet1, output AZ1).
Grid cells are finite numbers, strings, booleans or null; at most 100 rows x 50 columns.
The output is bounded to A1:AZ101. Category is author-supplied primary task metadata
(aggregation, lookup, logical, date, text); missing metadata is reported as uncategorized,
not inferred from an LLM's functionsUsed claim.

Each attempt evaluates in a fresh engine using only built-in spreadsheet expressions.
No JavaScript eval, dynamic generated scripts, custom plugins, Excel writes or input
injection are involved. Engine dimensions are bounded. Bare TRUE/FALSE are registered
as boolean names because HyperFormula otherwise treats these Excel literals as missing
named expressions. Existing unsafe-function/reference checks run before evaluation;
volatile TODAY/NOW/RAND/RANDBETWEEN are rejected for reproducibility. Unsupported/evaluator
errors are failures, not silent exclusions. Existing fixture formulas are local input;
this evaluator is not a complete Excel parser or security sandbox for arbitrary programs.

Expected answers are preflighted before any provider call. A generated formula must
produce the scalar expected value, or the value of one of the accepted formulas on the
same grid. Types are compared strictly, with configurable absolute/relative numeric
tolerance (both default 1e-9). Destination must match the case target cell. Formula spelling
need not match. Equality on one grid does not prove general semantic equivalence; add
multiple grids/adversarial cases to test constants and edge cases. HyperFormula has
Excel compatibility differences, including date/array behavior, so a passing benchmark
is not a desktop Excel host test.

If the first attempt fails and correctionUtterance exists, send exactly one correction
with the original request and previous formula/status in history. Expected values,
accepted formulas and raw grids never enter generator inputs. Context follows Q15:
headers, addresses and types by default; at most five sample values/column only with
explicit --share-samples. The original fixture is retained between attempts.

## Providers and transport

The default mock response map is a separate checked-in file, authored independently of
expected values. It intentionally gives five incorrect first responses. Its percentages
are harness coverage, not measured LLM quality, and cannot satisfy Q17.

--provider live launches a separate built Electron main entry. Only packages/genai issues
outbound provider requests, using injected Electron net.fetch, never Node global fetch.
Every session gets the existing block policy. The injected transport also checks exact
host including port, refuses credentials/non-HTTP protocols, and sets redirect: error.
Both cloud and enabled local fallback hosts require explicit network allowlisting. No
allowlist is expanded automatically. Local fallback respects enabled=false. Model URLs
are normalized from configured hosts, with HTTPS for cloud and HTTP for local defaults.

Provider requests now carry a plain JSON Schema with a common object root and nullable
unused fields, rather than serializing a Zod object into the API request. Zod still checks
the business response/status after generation. This is required for the live benchmark's
structured-output path. Optional token/model metadata is preserved by both provider clients.

## Measurements

First-try accuracy is successes / all cases. After-one-correction accuracy is cumulative:
first successes plus recovered first failures / all cases. Missing correction/audio,
provider errors, invalid targets and evaluator failures remain in denominators. Rows
include attempts and reasons/stages; groups include all languages and categories, with
empty groups explicitly N/A.

First/correction latency is generation through structured response, including internal
validation retries/fallbacks and failed calls, excluding formula evaluation. End-to-end
latency sums first plus any correction, including evaluation, and audio playback/ASR in
audio mode. This is automated fixture timing, not human correction time. ASR playback
elapsed time is separate per attempt. Percentiles use nearest rank, with no samples N/A.
Attempts that never reach generation have no generation latency or provider bill.

Per-attempt cost sums reported input/output token usage across internal calls using
configured USD-per-million rates tied to model and an as-of date. Group cost/request is
mean total cost of generation requests (including corrections); overall total is also
reported. Unknown usage/rates, mismatched model or failed potentially billed calls => N/A,
not fabricated zero. Mock calls cost zero. Cached-token discounts, tax, machine/energy
cost and account-specific billing are not modelled. Partial unknown cost is never reported
as a complete total. An unresponsive generation has unknown provider-call count.

## Audio, reports and privacy

Optional WAV mode reuses the local ASR fixture adapter with cancellation. Only files under
fixtures/audio are accepted (realpath containment), and team files require existing consent
manifest entries. No recording, audio copies or network audio transport is added. This is
ASR + production formula router + evaluator, ending at a local result; it never writes a
workbook, because app writes require interactive ActionGate confirmation. No team formula
recordings have been supplied; audio formula quality is pending.

Running the command explicitly opts into local timestamped JSON/Markdown reports under
docs/benchmarks. Reports record mode, model/provider calls, configuration, case/response
hashes and per-case measurements. App config/API keys/HTTP error bodies are not persisted.
Users can remove their report files with Finder/Explorer. Ctrl+C cancels outstanding work;
this standalone tool does not capture input or change Gestura's global pause controls.

## Sources checked

- [HyperFormula licence](https://handsontable.com/docs/hyperformula/guide/license-key.html) and installed 3.5.0 LICENSE.txt: GPLv3/proprietary options.
- [HyperFormula API](https://hyperformula.handsontable.com/docs/api/index.html): buildFromSheets, setCellContents, getCellValue and destroy.
- [Known limitations](https://handsontable.com/docs/hyperformula/guide/known-limitations.html): evaluator/Excel differences.
- [Electron net](https://www.electronjs.org/docs/latest/api/net/): Electron fetch uses Chromium's network stack; Node fetch uses Node's stack.
- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create): structured response format and token usage.
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md): chat token counts.

## Smoke evidence

On macOS, text mode completed 20 requests to an allowlisted loopback stub and audio mode
completed one ASR-to-router-to-stub-to-evaluator request with the published Cantonese
sample. Model labels explicitly say NOT-LLM. Audio used a constant response to check
transport, not formula accuracy. These runs validate local wiring only; real-provider
quality, real billing and Windows runtime remain manual checks.
