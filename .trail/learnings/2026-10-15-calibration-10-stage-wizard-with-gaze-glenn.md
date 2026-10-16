---
title: Calibration — 10-stage wizard with gaze regression
author: Glenn
date: 2026-10-15
branch: main
touches:
  - packages/pointer/src/calibration.ts
  - apps/desktop/src/main/calibration/controller.ts
  - apps/desktop/src/renderer/control/CalibrationWizard.tsx
---

Calibration flow: CalibrationWizard (packages/pointer/src/calibration.ts:L36-L409) is pure logic with 10 stages: framing→neutral→range→gaze→deliberate-blinks→natural-blinks→quick-test→review→complete/cancelled. CalibrationController (apps/desktop/src/main/calibration/controller.ts:L14-L353) wraps it with IPC and CalibrationStore persistence. UI: CalibrationControl React component (apps/desktop/src/renderer/control/CalibrationWizard.tsx:L25-L293). Gaze calibration uses ridge regression: irisFeatures extracts 6 features/frame, fitRidge solves with ridgeLambda 0.001, predictGaze outputs normalized screen coords. GAZE_DOTS = 3x3 grid (9 points), TEST_TARGETS = 5 random points. CalibrationWizard is referenced by scriptedWizard (calibration-fixture.ts) and calibration.test.ts.
