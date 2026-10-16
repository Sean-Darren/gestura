# 0004: Local SenseVoice and Silero speech recognition

Date: 2026-10-15. Step: P3.1.

## Models and dependencies

Selected `sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17`, the newest CPU-compatible SenseVoice int8 export listed on the official sherpa-onnx `asr-models` release when checked. It supersedes the dated 2025-09-09 export. Its README identifies the source as FunAudioLLM/Fun-ASR-Nano-2512; its archive contains a single SenseVoice-compatible `model.int8.onnx`, `tokens.txt` and five sample WAVs, including Cantonese. Hardware-specific Rockchip/Ascend/QNN exports are unsuitable for the shared macOS/Windows CPU interface.

- Archive SHA-256: `257936ea9a64cbe33200274e6367fc26d373ff6ca58b996b15108ffd6b9f6148` (GitHub release asset digest, independently verified on download).
- Model SHA-256: `9dc6e72aa8bc6f5966cf2857a0ce3a425b1d72e91500e147d66329f407c017a1`.
- Tokens SHA-256: `2db4bb25d046e8849e336c9465e248e1694914d996c58c71bdeca18cfb722992`.
- Silero `silero_vad.onnx` SHA-256: `9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6` (official release asset digest).
- Sample checksums are pinned in `scripts/speech-assets.mjs`. The fetcher verifies the archive before extracting only named members, then checks each installed file. A valid local cache requires no downloads. App builds verify and copy the models into `resources/speech`; packaged resources must retain that directory.
- `sherpa-onnx-node` 1.13.8: official Node addon, local CPU ASR and VAD. Published platform packages cover darwin-arm64, darwin-x64 and win-x64. Its CommonJS export is imported through the default object; named ESM imports failed in the Electron utility smoke test and were corrected. No rebuild/install script is needed for the addon. macOS arm64 Node and Electron paths were exercised; Intel macOS and Windows runtime checks remain pending.
- `opencc-js` 1.4.2: platform-independent JS conversion with bundled dictionaries; no native build or runtime fetch. Q12 default `{from:'cn', to:'hk'}` converts script/Hong Kong variants without paraphrasing spoken Cantonese or applying optional phrase localization. Already compatible text is returned unchanged. The default full package includes the required dictionaries.

## Maintainer-authorized audio transfer exception

In this chat, the maintainer explicitly approved a narrow exception to Hard rule 3: in-memory audio may travel directly from the hidden capture renderer to the local speech utility process. Main creates/transfers MessagePort endpoints but never receives audio payloads. Audio is never written to disk or sent over a network. This records the human's authorization; the agent did not edit the Hard rules section. The human should reconcile AGENTS.md with this authorized architecture when maintaining that section.

Existing published upstream WAVs and future consented test recordings are input fixtures only. Gestura has no microphone recording/export feature. No team recordings were supplied; the maintainer confirmed none exist yet. Team results remain pending.

## Capture and process boundaries

Listening defaults off. Explicit control/dwell starts a hidden sandboxed renderer plus a utility process. Only that active capture renderer receives audio-only permission; vision remains video-only, and control/overlay cannot request media. No camera is requested by speech.

AudioWorklet mixes channels to mono and applies a streaming windowed-sinc low-pass resampler to 16 kHz Float32. It emits 512-sample/32 ms packets with sequence numbers and epoch capture times. Acknowledgements bound queued PCM to about one second; overflow fails closed instead of joining discontinuous speech. Port descriptors, PCM packets, acknowledgements, status and transcript messages use shared schemas. The preload still exposes only `gestura.on` and `gestura.send`; it transfers the dedicated port only into the local speech page. Zod runs without generated functions in that renderer/preload so strict CSP can remain enabled.

Silero VAD: 512-sample windows, threshold 0.5, minimum speech 250 ms, silence 500 ms, maximum speech 15 s by default. Config is schema validated. A bounded queue sends completed segments to asynchronous SenseVoice decoding with inverse text normalization enabled, two CPU threads. Speech samples never reach main or control/overlay. VAD speech activity gates the existing mouth-gesture suppression, without granting confirmation authority or implementing voice commands.

Stop, global pause, control-window close, capture failure, malformed packets, discontinuities, worker failure or startup timeout destroys the capture renderer and kills the speech utility. Pending getUserMedia results are stopped if cancelled. Pause never restarts listening automatically. The overlay's static high-contrast “Microphone live” label reflects a real capture status and is absent when off. Transcripts are temporary control-window previews, cleared on stop; no dictation insertion or intent execution exists in P3.1.

## Results and limitations

Final real-time WAV replay on the development macOS arm64 machine: five detected segments across en/zh/yue/ja/ko; p50 624 ms, p95 646 ms from detected VAD segment end to normalized transcript. Per-sample times: en 631, zh 624, yue 582, ja 646, ko 605 ms. An earlier run measured p50 626 ms/p95 747 ms. These are small-sample latency measurements, not accuracy claims or live-microphone results. A production Electron utility also returned the Cantonese transcript “呢幾個字都表達唔到我想講嘅意思” from the upstream sample, including Hong Kong script conversion.

The newest export returns an empty native `lang` field for these samples. `Transcript.lang` therefore honestly reports `unknown`; no heuristic labels Cantonese as Mandarin. A future explicit language-ID requirement would need a separate decision or upstream fix. The benchmark measures VAD boundaries rather than human-labelled speech end. Team recordings, consented accuracy evaluation, actual microphone permission/lifecycle behavior and Windows/Intel runtime tests remain pending. Live transcripts and interaction logs are not persisted.

## Sources inspected

- [Official ASR release and asset metadata](https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models), including the GitHub release API asset digests.
- [Selected archive](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17.tar.bz2) and its bundled README.
- [Official Node examples](https://github.com/k2-fsa/sherpa-onnx/tree/master/nodejs-examples) and installed 1.13.8 `non-streaming-asr.js`, `vad.js`, `types.js` for the current class-based API.
- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process), [MessagePorts/context isolation](https://www.electronjs.org/docs/latest/tutorial/message-ports).
- [OpenCC JS source and regional conversion documentation](https://github.com/nk2028/opencc-js).
