# 0010: Pure multilingual intent matching and voice confirmation onset

Date: 2026-10-15. Step: P3.2.

## Catalogue and boundaries

`packages/intent/commands.yaml` defines 17 intent IDs, their slots, and en/yue/mixed phrases. Cantonese phrases use Traditional characters and colloquial forms. `pnpm intents:generate` parses YAML with unique keys and aliases disabled, validates it through core schemas and writes checked-in JSON. Tests reject missing/duplicate IDs, invalid slots, weakened confirmation flags and stale generated data. The runtime imports JSON and pure conversion dictionaries: no filesystem, DOM, Electron or network imports.

New tool dependencies are yaml 2.9.1 (validated catalogue compilation), csv-parse 6.2.1 (quoted JSON slots/BOM/CSV handling), and tsx 4.23.15 (TypeScript CLI using Node's --import loader). They live in tools/voice-bench devDependencies. OpenCC JS 1.4.2, already used by desktop, is an explicit pure runtime dependency of intent for Traditional/Simplified folding. YAML/CSV are JavaScript and tsx uses esbuild's platform packages; the entry commands use Node/pnpm rather than shell environment assignments and support macOS/Windows. Local checks ran on macOS; the Windows teammate still needs to run them. No dependencies are loaded from a CDN or used for runtime network access.

## Matching

1. Bound input (default 2,000 characters), NFKC width, lowercase, punctuation and whitespace normalization.
2. Fold Hong Kong Traditional to Simplified for matching only. Normalize English/Chinese numbers, including Cantonese 廿/卅/卌. Cell/range parsing handles letter names/NATO aliases, row numbers and to/到/至/colon separators. Bounds are A1:XFD1048576. Ambiguous ASR homophones are not automatically corrected into cell values.
3. Full-utterance template matching first, with typed slots. Formula templates remove their explicit prefix but preserve the request's original case, punctuation, characters and symbols. Other free Excel requests are returned verbatim. No free text is executed.
4. Fuzzy scoring uses normalized edit similarity, default threshold 0.86 and runner-up margin 0.08. These are tunable schema defaults, not calibrated probabilities. Candidate ties use code-point ordering for reproducibility. Cell slots must parse exactly; their length cannot boost the command-word confidence. Free-text formula content is never fuzzy-corrected.
5. Low confidence or fuzzy ambiguity in explicit Excel context returns a `genai-request` route value. Outside Excel it returns up to three distinct structured suggestions. Exact confirmation/cancellation without a pending proposal returns a pending-required result. Input/context is provided by a future trusted caller; this step does not guess foreground context or call a provider.

Confirm/cancel templates are exact-only and pending-only. Neither appears in fuzzy candidates or suggestions. Exact confirmation additionally requires a finite speech-onset timestamp and returns `{kind:'voice-confirm', tSpeechStart}`. A future gaze selection may execute an ordinary intent through the appropriate dispatcher but must never synthesize voice evidence for confirmation. Explicit formula matches carry intent id formula-request; both that id and the fallback genai-request result are data for a later main-process GenAI router.

## ActionGate clocks and presentation

ActionGate now exposes `markShown(id)` for trusted presentation code to call after the proposal is visible. It records its own epoch timestamp rather than accepting renderer timestamps. Re-showing replaces that timestamp and requires fresh speech. Voice confirmation requires `shownAt < tSpeechStart <= epochNow`; missing display state, missing/invalid onset, before/equal display onset and future onset are rejected. Recognition completion time is never substituted for speech onset.

Proposal lifetime and ConfirmedAction.confirmedAt retain their monotonic performance.now clock, preserving NativeBridge's expiry checks. Epoch speech/display times use performance.timeOrigin + performance.now, matching P3.1 transcripts. The module-private brand, mint tracking, content hash, <60 s expiry and single use remain. Held-mouth evidence retains its Q4 contract; blink/wink/dwell remain rejected. NativeBridge tests use allowed held-mouth fixture evidence rather than timestamp-free voice evidence.

P3.2 adds no renderer endpoint for markShown/confirmation and no active proposal card. P3.3 and later presentation code must bind pending state/onset to the actual trusted speech source and proposal UI. The regression test demonstrates late ASR for an utterance started before display cannot authorize the action. This does not claim the future UI presentation integration has been implemented.

## Benchmark and evidence

`pnpm bench:voice` is text CSV mode by default and runs without speech models/addons. It reports intent and intent-plus-slot accuracy overall and per supplied language label. `--json` emits machine-readable results. Audio mode reads only fixture WAVs, runs the production local VAD/SenseVoice engine, then matches the recognized text with its real onset. No microphone is opened. Missing audio rows are skipped explicitly; errors are counted as wrong; zero coverage is N/A. Team files require the consent manifest. Reports print locally and are never uploaded or automatically saved.

The existing five-language ASR timing suite is preserved as `pnpm bench:voice:asr`. The new 60-case command CSV is explicitly synthetic and overlaps catalogue examples: 60/60 exact in the local regression run (20/20 in each language group). This is not a held-out speech accuracy measurement. The one available Cantonese audio smoke case is a published non-command sample; correct rejection is not command-recognition accuracy. Consented command audio for all language groups remains pending. The team previously confirmed that recordings are not yet available.

Q4 voice/held-mouth confirmation and Q12 Traditional Hong Kong output defaults remain. Chinese folding is not applied to inserted/dictated content. Dictation confirmation (Q11), live dispatch, undo behavior, phrase palette UI and GenAI execution remain later integration work. No new workflow, telemetry, recording, training or git writes were added.

## Documentation inspected

- [yaml parser and alias/validation options](https://eemeli.org/yaml/)
- [csv-parse ESM/sync API](https://csv.js.org/parse/distributions/nodejs_esm/)
- Installed tsx 4.23.15 loader exports and [upstream tsx](https://github.com/privatenumber/tsx); Node --import entry was exercised locally, avoiding the CLI's unnecessary IPC listener in the sandbox.
- Installed OpenCC JS 1.4.2 t2cn conversion and [upstream conversion documentation](https://github.com/nk2028/opencc-js).
