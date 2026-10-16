---
title: Vision pipeline — camera to FaceFrame
author: Glenn
date: 2026-10-15
branch: main
touches:
  - apps/desktop/src/renderer/vision/camera.ts
  - apps/desktop/src/main/vision/controller.ts
---

Vision pipeline: CameraSource (apps/desktop/src/renderer/vision/camera.ts:L62-L206) captures via getUserMedia, runs MediaPipe Face Landmarker WASM (bundled locally in resources/vision/wasm/, never CDN), outputs FaceFrame (478 landmarks × 3, 52 max blendshapes, 4×4 matrix). VisionController (apps/desktop/src/main/vision/controller.ts:L42-L237) manages live camera + fixture replay + recording via RendererFrameSource with FrameBus pub/sub. Two WASM variants: with SIMD and nosimd. FaceMetrics tracks fps + inference p50/p95. Replay: FixturePlayer plays JSONL fixtures, ScriptedRecorder saves. VisionController is referenced by main index.ts and controller.test.ts.
