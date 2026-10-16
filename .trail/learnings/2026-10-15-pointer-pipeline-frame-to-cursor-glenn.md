---
title: Pointer pipeline — frame to cursor
author: Glenn
date: 2026-10-15
branch: main
touches:
  - packages/pointer/src/index.ts
  - packages/pointer/src/snap.ts
---

PointerPipeline (packages/pointer/src/index.ts:L21-L113) is the core cursor control. process() chain: headPose(matrix) → mapToScreen → gaze estimation (estimateGaze or calibrated irisFeatures+predictGaze) → GazeJump (jumps cursor when gaze stable for gazeStableMs and far enough) → OneEuroFilter (adaptive low-pass, separate X/Y) → CursorCommand. headPose is called by PointerPipeline.process, CalibrationController.consume, and GestureOverlay.pausedFrame. SnapSelector (packages/pointer/src/snap.ts:L47-L110) scores UI targets by edge distance + center distance + gaze proximity + role priors with hysteresis — challenger must beat incumbent by switchMargin for switchMs. Hot path budget: 100ms p95 (capture 33ms, inference 25ms, filter 2ms, IPC 5ms).
