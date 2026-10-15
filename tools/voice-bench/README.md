# Voice benchmark

Run from the repository root:

```sh
pnpm bench:voice
pnpm bench:voice --csv fixtures/transcripts/p3.2-commands.csv
pnpm bench:voice --mode audio --csv fixtures/transcripts/p3.2-audio-smoke.csv
pnpm bench:voice --json
pnpm bench:voice:asr
pnpm intents:generate
```

`bench:voice` defaults to text mode, independent of models/native addons, and prints overall plus en/yue/mixed accuracy. Intent accuracy checks the id; exact accuracy also checks every slot. Failures count in the denominator. Missing audio is explicitly skipped; an empty evaluated set is N/A and exits unsuccessfully. Errors also exit unsuccessfully. Use `--json` for a full machine-readable report with per-case outcomes. Reports are printed locally, with no automatic file writes or uploads.

CSV paths resolve from the repository root on macOS and Windows. The required format and optional context/pending/audio columns are documented in fixtures/transcripts/README.md. ASR mode uses the P3.1 CPU VAD/SenseVoice engine with original WAV pacing and requires pnpm models:fetch. It does not open the microphone, insert text, execute commands or call a GenAI provider. The fixture language group is the benchmark label; ASR language metadata is not used to guess it.

The standard 60-case text suite is synthetic, includes catalogue examples and is checked by pnpm verify with a 90% per-group intent-plus-slot threshold. That regression result is not independent real-user accuracy. The supplied audio smoke case is a non-command rejection check, not command accuracy. Team command recordings are still pending.

`bench:voice:asr` preserves P3.1's five-language WAV latency benchmark separately. `intents:generate` validates commands.yaml and updates its checked-in JSON representation. A CI test fails if the JSON becomes stale. YAML/CSV parsing and the tsx TypeScript loader are development tools only; packages/intent imports bundled data and pure OpenCC conversion dictionaries without filesystem/network/DOM/Electron access.
