# Landmark fixtures

`p2.1-synthetic.jsonl` is generated test data, not a camera recording or a model accuracy benchmark. It contains four derived FaceFrames and no pixels or audio. The paired labels use the same millisecond clock. Real recordings require an explicit session start and remain local in the app userData fixtures directory.

P2.2 adds synthetic FaceFrame JSONL and paired labels for pointer regression tests:

- `p2.2-hold-still`: 180 samples at 60 Hz; yaw = 4° + 0.08° sin(1.7i), pitch = 3° + 0.08° cos(1.3i). The nonzero baseline exercises gain/filtering outside the dead zone. RMS is measured about the mean after a 60-frame warm-up at 1920×1080 physical pixels.
- `p2.2-head-sweep`: 900 samples at 60 Hz, with 180-frame holds at center, yaw −40°, yaw +40°, pitch −35°, pitch +35°. Edge coverage allows one physical pixel for filter settling.

Matrices are column-major R_y(yaw) R_x(pitch); inference timestamps are capture + 10 ms. Landmarks are zero placeholders; these fixtures test head control only. They do not establish real-user jitter, camera accuracy or gaze accuracy. No pixels/audio are included.
