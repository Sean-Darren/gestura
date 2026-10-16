# 0005 — Pointer coordinates, filtering and coarse gaze

Date: 2026-10-14
Step: P2.2

## Contracts

`packages/pointer` is pure TypeScript. The caller supplies FaceFrames, a neutral profile, a display and timestamps; there are no clocks, Electron/DOM/filesystem imports, or network APIs inside the package.

MediaPipe's web task copies the pose proto's packed matrix data, whose default layout is column-major. We normalize the three rotation columns to remove scale and use the face-forward column to derive yaw and pitch. Translation is ignored. The convention is yaw positive → screen right and pitch positive → screen down, with signed degree tests including combined rotations. Live direction needs a human check against an unmirrored camera.

Sources: [MediaPipe web task conversion](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts), [matrix proto layout](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/framework/formats/matrix_data.proto).

`mapToScreen` subtracts profile neutral angles, removes the 0.6° dead zone and normalizes by the remaining 25° yaw / 20° pitch range. For normalized magnitude u, gain is `0.35u + 0.65u³`, providing precision near center and increasing travel gain. Mapping and filtering produce physical screen pixels, clamped to primary bounds through the last valid pixel. On macOS native bounds are Quartz points: multiply by scale for the pipeline, then divide commands by that same scale for NativeBridge.moveTo. Windows bounds/commands are already DPI-aware pixels; do not multiply them again. Mixed-monitor support remains outside Q6.

## Filtering and gaze

Each axis owns a One Euro filter. Millisecond capture timestamps determine dt in seconds. A filtered derivative controls `cutoff = minCutoff + beta * |derivative|`; defaults are 1 Hz / 0.01 / 1 Hz for minCutoff / beta / dCutoff. Duplicate or backwards capture timestamps are ignored. Face loss, invalid matrices, pause, source/display changes, and gaps over 250 ms reset filters and gaze state. Analytic constant, step, ramp, noise and variable-dt tests cover the equations.

Reference: [Casiez, Roussel and Vogel's One Euro filter](https://gery.casiez.net/1euro/). Defaults are starting values, not a claim of user calibration.

Coarse gaze projects the iris centers (468/473) onto each eye's corner axis and perpendicular, normalizes by eye width/height and averages both eyes. Head correction subtracts 0.005 normalized screen units per degree of yaw/pitch. This is a heuristic for future calibration; no gaze-accuracy claim is made. A candidate must remain within 40 physical pixels of its stability anchor for 300 ms and be strictly more than 300 pixels from the last pipeline cursor. Jumping resets filters and offsets the head mapping so the next frame fine-tunes from the jump rather than returning to the previous point.

Gaze defaults off. The main controller additionally forces it off until the calibration step provides a validated calibration contract; enabling the pure estimator in unit tests does not activate live gaze. Config includes the future switch but P2.2 does not expose a gaze toggle.

## Runtime and timing

Pointer movement starts off and needs an explicit accessible enable control. Main reads primary-display metadata once when enabling; display changes disable movement until re-enabled. Permission denial, a missing addon/display or native error becomes panel guidance instead of an app crash. Every live command uses the existing Zod-validating pause-aware NativeBridge. Main also rejects stale/future/duplicate captures and captures older than the latest pause/resume barrier.

The existing live/replay FrameBus feeds the pipeline. Replay preserves original timestamps and previews points but never injects input. Historical fixture timestamps are not mixed with the live latency clock. A no-face frame and a watchdog clear measurements when fresh frames stop arriving.

Stamps are tCapture → tInferDone → tPointerDone (after the pure stage) → tMoveSent (immediately before NativeBridge.moveTo). Rolling p50/p95 use nearest rank over the latest two seconds, capped at 240 dispatched samples, published at most every 100 ms. These values measure capture-to-send, not OS event delivery or physical sensor exposure. Real camera-to-cursor p95 <100 ms remains unmeasured until hardware checks.

Local `userData/config.json` accepts `pointer` settings and `pointerProfile.neutral` degree offsets. Existing files without these fields receive defaults. Calibration UI is a later step; changing config requires restart. RMS threshold defaults to 3 physical pixels and is tunable through PointerConfigSchema for regression tooling; it does not clamp movement or fabricate live jitter.

## Regression evidence

P2.1's four-frame synthetic fixture remains a determinism check. New synthetic fixtures use the same derived FaceFrame JSONL and paired labels format: nonzero hold pose with deterministic small oscillation; center and four-edge holds. No camera pixels or audio are included. Tests report jitter about the mean after warm-up and edge coverage after filtering. Real-user jitter and gaze calibration require separate local recordings.
