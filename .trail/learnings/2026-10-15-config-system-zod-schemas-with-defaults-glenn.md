---
title: Config system — zod schemas with defaults
author: Glenn
date: 2026-10-15
branch: main
touches:
  - packages/core/src/config/index.ts
---

Config system (packages/core/src/config/index.ts): AppConfigSchema with sub-schemas for pointer, gestures, snapping, vision, calibration, network. All zod-validated with defaults. PointerConfig: deadZoneDeg 0.6, yawRange 25deg, pitchRange 20deg, centerGain 0.35 cubic curve, OneEuroFilter (minCutoff=1, beta=0.01, dCutoff=1), gaze stable 300ms/jump 300px, staleFrameMs 250. GestureConfig: mode off|blink|dwell, longBlink 400-1500ms, winkMin 250ms, onsetSyncMs 80ms, dwellMs 1000ms, cooldown 500ms, jawHoldMs 800ms. SnapConfig: radiusPx 60, switchMargin 0.2, switchMs 100, rolePriors (button:0, link:0.03, list-item:0.08, edit-field:0.06). CalibrationConfig: neutralMs 3000, rangeMs 5000, gazeDotMs 1500, ridgeLambda 0.001.
