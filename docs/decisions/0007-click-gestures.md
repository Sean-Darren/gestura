# 0007: Calibrated click gestures and a head-accessible pause corner

Date: 2026-10-15
Status: implemented for P2.4; live accuracy validation pending

## Decisions

Use Q7's default: a bilateral 400–1500 ms closure clicks left on reopening; a left wink of at least 250 ms clicks right. Right winks emit diagnostics only. Calibration can raise the minimum deliberate duration; an incompatible configured maximum disables blink mode with a visible explanation. A closure must start from known open eyes, bilateral onsets must be within 80 ms, and flutter, missing signals, face loss, stale frames, rapid movement or mouth activity invalidate the episode. Dwell is an alternative, one-shot anchor; leave its radius to rearm. Drag emits balanced down/up events through an internal API for Phase 3.

Each eye has an independent hysteresis state. Prefer MediaPipe blendshapes. When absent, use aspect-correct eye aspect ratios relative to the profile's median open-eye neutral capture. Legacy profiles without that baseline require recalibration for fallback. No trained classifier or new external dependency is introduced. Indices follow the [official MediaPipe eye contours](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts).

Freeze at the last dispatched position on closure, hold pointer filter timestamps without integrating head/gaze noise, then move to that immutable position immediately before injecting the click. NativeBridge remains the pause/validation boundary. Gesture events never mint ConfirmedAction or enter ActionGate confirmation.

Mouth holds require an explicit `silent` speech state. Unknown or speaking never emits toggleListening; runtime stays unknown until Phase 3 provides reliable speech state. Jaw dynamics conservatively suppress clicks, but facial features alone cannot guarantee zero clicks for every form of talking. Synthetic replay results are implementation checks, not measured human accuracy.

The always-available 72 px top-right corner is reserved against native gesture clicks. Dwell for 1.2 seconds toggles pause; leaving is required before another toggle. While paused, only local vision inference continues at 5 fps, feeding a virtual head cursor for resume. No native movement/click, ordinary gesture recognition, recording or replay runs from those frames. The virtual cursor is anchored at pause and scales each side of the head range to keep both edges reachable. Camera activity is disclosed in control and overlay; Stop Tracking releases the camera/model. This deliberate change to earlier pause behavior was included in the approved P2.4 plan.

All logic is TypeScript and shared between macOS and Windows; native injection still uses the existing shared interface and coordinate conversion. Runtime checks on both OSes remain required. No workflow changes were made.
