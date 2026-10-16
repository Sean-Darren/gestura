# 0004: Local face tracking and replay

Date: 2026-10-14
Status: implemented; live camera/GPU checks pending on macOS and Windows

## Assets and dependency

`pnpm models:fetch` downloads Google's versioned float16/1 Face Landmarker task,
verifies SHA-256 before installation, then bundles the matching SDK WASM files.
The pinned checksum is `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
(3,758,596 bytes). The pin was established from the versioned Google HTTPS
artifact during this step. Cached files are rechecked; bad downloads never
replace an existing file. Model/WASM files stay ignored in Git.

The selected dependency is `@mediapipe/tasks-vision` **0.10.32**, Apache-2.0.
The current 1.1.0 release was inspected and rejected because its task creation
unconditionally initializes usage logging to odml.pa.googleapis.com. The selected
JS bundle and WASM loaders lack that endpoint and logger entrypoints. Bundling
rejects a version change or reappearance of those known logging signatures;
future upgrades still need source review. Outbound renderer requests also remain
blocked by session policy and CSP.

Development and production builds verify and copy assets into resources/vision.
Packaged apps use extraResources/vision. A secure local `app://vision` protocol
serves only the model and named WASM loader/binary paths; arbitrary disk paths,
remote hosts, query strings, and traversal paths are rejected. Only the vision
CSP adds `wasm-unsafe-eval` and the local asset origin, without general
unsafe-eval or remote scripts. WASM loading never uses a runtime CDN.

## Capture and contract

Camera tracking starts only from the control panel. The hidden vision renderer
requests ideal 1280x720, ideal 60 fps, minimum 30 fps, and audio:false. Negotiated
resolution/fps are shown; unsupported constraints, denied permissions, missing
assets, or GPU failure produce a visible error rather than silently changing the
pipeline. Electron grants media permission only for video in that vision
WebContents. OS camera permission can still deny access.

FaceLandmarker uses VIDEO, GPU, one face, blendshapes, and facial transformation
matrices. Inference is synchronous inside the hidden capture renderer, with
background throttling disabled; main and control do not perform inference.
Each newly decoded video time is processed once, without overlapping inference.
Slow inference can skip intervening camera frames; the panel reports processed
fps, rather than claiming all negotiated camera frames were processed.

`tCapture` is sampled immediately before inference on the decoded frame, and
`tInferDone` immediately after detectForVideo. Both use monotonic milliseconds
relative to performance.timeOrigin. They measure inference, not sensor exposure
or decode latency. Landmarks pack x,y,z triples in SDK index order (478*3 values);
the 16 matrix values copy the SDK's flattened data unchanged. Blendshape left
and right refer to the subject, with no mirrored input. No-face frames contain
zero arrays and an empty score map, so stale features cannot drive later logic.

FaceFrame uses Float32Array in renderer processing and main. The narrow
contextBridge accepts plain numeric arrays, which the preload rehydrates after
Zod validation; Electron IPC uses structured-cloned typed arrays. Only the vision
sender may publish frames/status. Control may request tracking/fixture operations;
overlay may not impersonate either. No image, canvas, video, or audio crosses IPC.
Control receives bounded-rate summary metrics and prompt/status data, not pixels.

Pause stops capture/inference and releases camera/GPU resources. Main drops
frames while paused; replay pauses its clock, and prompt progression also pauses.
Stop cancels pending source initialization and cleans up late resources. A camera
error aborts an unfinished recording without silently saving a partial session.

## Recording and replay

`tools/replay` supplies the FrameSource subscription/start/stop/pause contract,
frame bus, scripted recorder, strict JSONL parser, labels, and timing player.
Main's live renderer source and fixture player both feed VisionController.frames.
No pointer, gesture recognizer, speech capture, or input injection is added here.

Record scripted session is an explicit local opt-in: eight five-second prompts
cover four screen corners, long blink, left wink, reading, and held mouth opening.
The reading prompt requests no microphone and inserts no dictated text. Labels
store actual prompt start/end times, extending the interval across pause. Only
derived FaceFrames are stored. Automatic completion or Save recording now writes
frames.jsonl and labels.json to a new userData/fixtures/<uuid> directory. Existing
files are never overwritten. Cancel discards the in-memory session.

Replay selects a local JSONL file through the main-process file picker. Files are
limited to 200 MB and 20,000 frames, validated, and replayed by original capture
time offsets, preserving frame timestamps. Pause/resume shifts the playback
clock; stop cancels scheduled work. Labels are saved alongside recordings but
are not required by playback. Users manage/delete local fixtures themselves.
The checked-in p2.1 fixture is explicitly synthetic, containing no personal media
and making no model-accuracy claim.

## Sources

- [Current MediaPipe JavaScript options](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.facelandmarkeroptions)
- [Face Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [Google model bundle](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)
- [Current task creation/logger source](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/core/task_runner.ts)
- [Electron contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)
- [Electron session permissions](https://www.electronjs.org/docs/latest/api/session)
