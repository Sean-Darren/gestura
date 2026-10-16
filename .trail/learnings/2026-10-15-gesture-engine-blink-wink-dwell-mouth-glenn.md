---
title: Gesture engine — blink/wink/dwell/mouth
author: Glenn
date: 2026-10-15
branch: main
touches:
  - packages/gestures/src/index.ts
  - fixtures/landmarks/p2.4-gestures-synthetic.jsonl
---

GestureEngine (packages/gestures/src/index.ts:L26-L238) processes blendshapes into gesture events. Eye detection uses either MediaPipe blendshapes (eyeBlinkLeft/Right) or EAR fallback (eyeAspectRatios from 6 landmarks per eye, normalized against calibration EarBaseline with hysteresis). Blink mode: long-blink (both eyes closed ≥400ms, onset sync ≤80ms) → left click; left wink (≥250ms) → right click. Dwell mode: cursor stable within dwellRadiusPx for dwellMs → left click. Mouth: jawOpen > jawOpenScore for jawHoldMs + silence → toggleListening. CornerDwell for pause toggle. Cooldown: 500ms. Tested against fixtures/landmarks/p2.4-gestures-synthetic.jsonl. GestureEngine referenced by gestures.test.ts and gesture-fixtures.test.ts.
