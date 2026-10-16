# Local ASR fixtures

`pnpm models:fetch` extracts the checksum-pinned sherpa-onnx SenseVoice sample WAVs into `sherpa/`. Source: https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models, export `sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17`. These are upstream published examples, not recordings made by Gestura.

`pnpm bench:voice:asr` replays those five WAVs at their original timing through the production VAD/ASR engine and prints transcript latency. It reads local files only and never captures or saves microphone audio. `pnpm bench:voice` now defaults to the P3.2 text CSV intent benchmark. Ordinary `pnpm verify` skips the heavyweight real-model suite; unit tests still run.

Team fixtures are pending: no consented team recordings were supplied. To include an existing consented recording, provide a mono 16 kHz PCM16 or Float32 WAV under `team/` and add an entry to `team/manifest.json`: `{ "file": "session-01.wav", "consent": "Consent reference and approved test scope" }`. Use no identifying names. Keep private recordings out of commits unless contributors explicitly consent to redistribution. The app has no recording/export function.

Reported speech-end times are VAD segment boundaries, not human-labelled ground truth. Numbers measure this machine and these samples; they do not establish Cantonese accuracy or microphone performance.
