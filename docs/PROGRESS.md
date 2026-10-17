# Gestura — Progress log

The AI coding agent appends one entry per plan step (newest at the bottom).
The human reviews each entry before committing. Keep entries short and factual.

## Entry template

```
## <Step ID> — <step title> — <YYYY-MM-DD>

Status: done | partial | blocked
Platforms checked: macOS ☐  Windows ☐

What changed
- ...

Measured numbers (if any)
- e.g. moveTo p95 = 0.4 ms; hold-still jitter = 2.1 px RMS

Known issues / follow-ups
- ...

Manual checks for the human
- [ ] ...

Open-question defaults used
- e.g. Q7 default (long blink = left click)

Suggested commit message
feat(<Step ID>): ...
```

---

## P0.0 — Repo created — 2026-10-14

Status: done
Platforms checked: macOS ☑  Windows ☐

What changed
- Created empty repo with AGENTS.md, docs/PROGRESS.md, docs/open-questions.md.
- apps/desktop created from the electron-vite React + TypeScript template (not yet hardened).

Next step
- P0.2: scaffold the pnpm workspace and secure Electron shell.

## P0.2 — Monorepo and secure Electron shell — 2026-10-14

Status: partial
Platforms checked: macOS ☑  Windows ☐

What changed
- Added the pnpm workspace, root verification scripts, package stubs, native crate scaffold, and macOS/Windows verification workflow.
- Added a three-window Electron shell on Electron 44.7.1 with isolated, sandboxed renderers, strict CSP, and local-only navigation.
- Added the Zod IPC envelope, channel and payload validation, sender checks, and narrow preload API.

Measured numbers (if any)
- `pnpm verify`: 11 test files and 13 tests passed.
- `electron-vite build`: main, preload, and all three renderer pages built successfully.

Known issues / follow-ups
- Vision, speech, AI, and native platform behavior remain unimplemented by design.
- The Electron runtime binary could not be downloaded in this sandbox, so a live app launch and window behavior were not checked here. Windows CI has not run locally; GitHub Actions covers macOS and Windows.

Manual checks for the human
- [ ] Launch with `pnpm dev`; confirm the control window appears, the transparent overlay covers the primary display and passes clicks through, and the vision window stays hidden.
- [ ] Confirm the control window reports the IPC ready status.

Open-question defaults used
- Q2: TypeScript workspace packages; Rust scaffold only under `native/`.

Suggested commit message
feat(P0.2): scaffold secure Electron monorepo

## P0.3 — Enforce safety rules in code — 2026-10-14

Status: done
Platforms checked: macOS ☑  Windows ☐

What changed
- Added ActionGate proposal hashing, a 60-second expiry, single-use confirmation, and a module-private ConfirmedAction brand. Only voice-confirm and held-mouth-gesture evidence can mint an action.
- Added validated local config loading from Electron userData/config.json, with an empty network allowlist and local logging disabled by default.
- Applied request blocking to the default and newly created Electron sessions. Local app resources pass; renderer requests cannot use the outbound allowlist; main-process requests can reach exact allowlisted hosts. Blocked attempts are locally logged only after explicit logging opt-in, with a clear operation.
- Added ESLint network import/global restrictions for pointer, gestures, intent, and speech, plus a violating fixture lint test.
- Added the Ctrl+Option+P / Ctrl+Alt+P global hotkey, pause-state IPC broadcast to all BrowserWindows, and a dispatch guard that suppresses cursor/click operations while paused.

Measured numbers (if any)
- `pnpm verify`: lint and typecheck passed; 18 test files and 37 tests passed.
- `electron-vite build`: main, preload, and all three renderer pages built successfully.

Known issues / follow-ups
- Windows CI has not run locally. The desktop app was built but not launched, so native hotkey registration and live session blocking still need runtime checks on both platforms.
- No cursor/click dispatcher or speech utility process exists yet. The pause dispatch guard is tested and broadcasts to all current BrowserWindows; future input and utility-process code must use/subscribe to it.
- Local config and log paths are under Electron's userData directory. A settings UI for editing the allowlist and opting into/clearing logs is not part of P0.3.

Manual checks for the human
- [ ] Run `pnpm dev`; confirm all local renderer pages load and the pause hotkey registers on macOS and Windows.
- [ ] In a renderer console, try `fetch('https://example.com')` and confirm it is blocked; confirm local app assets continue to load.
- [ ] Put an exact host in userData/config.json and confirm a main-process request to it is permitted while a renderer request to it remains blocked.
- [ ] Set `logging.enabled` to `true`, trigger a blocked request, confirm only the origin is written to `blocked-requests.jsonl`, then clear the log.
- [ ] Subscribe to `system:pause-state`; press the hotkey twice and confirm every open window receives paused then resumed state.

Open-question defaults used
- Q4: spoken confirmation or held mouth gesture; blink, wink, and dwell are rejected.
- Q8: blocked-request logs are local, disabled until explicit opt-in, and user-deletable.

Suggested commit message
feat(P0.3): enforce action, network, and pause safety rules

## P1.1 — Native input injection — 2026-10-14

Status: partial
Platforms checked: macOS ☑  Windows ☐

What changed
- Added the napi-rs Node-API 8 addon behind a shared Rust input trait, using CGEvent on macOS and SendInput on Windows. It exposes cursor movement, mouse buttons/double-click/scroll, Unicode text, key combinations, cursor/display queries, and Accessibility permission checks/prompts.
- Documented why enigo 0.6.1 was not selected and how Quartz points, Windows physical pixels, per-display scale, and virtual-desktop normalization work in decisions/0002-input-injection.md.
- Added the desktop Zod wrapper and a matching native mock. The wrapper shares the global pause state, releases held buttons on pause, and requires an exact, fresh, single-use ActionGate confirmation for text. A pause cancels remaining text chunks even after resume.
- Added native:build, native:demo, and native:bench. The demo moves to primary-display corners after a five-second countdown. Per the human's Q4 decision, its text insertion phase remains pending until voice/mouth confirmation exists.
- Added native build/test/Clippy and artifact jobs for darwin-arm64, darwin-x64, and win32-x64, plus ASAR unpacking for .node files.

Measured numbers (if any)
- `pnpm verify`: lint and typecheck passed; 19 test files and 46 tests passed.
- Rust unit tests on macOS: 3 passed. Clippy with all targets and `-D warnings` passed on macOS and for the Windows MSVC cross-compilation check.
- Built both darwin-arm64 and darwin-x64 prebuilt addons; Mach-O architectures were confirmed. The arm64 addon passed the Node export/argument-rejection smoke check.
- Electron production build passed, including the demo and benchmark entrypoints.
- Native moveTo p50/p95 is not measured here: the sandbox reports input permission false and no active displays, and cannot create a CGEvent source.

Known issues / follow-ups
- Windows compilation/Clippy was checked from macOS, but Windows linking, unit execution, and runtime behavior still need CI/a Windows teammate. The win32-x64 binary will be produced by the configured CI job; it has not been built locally.
- Intel macOS addon loading still needs its matching CI runner or an Intel Mac.
- The Electron runtime binary remains unavailable locally, so the Electron demo/benchmark were built but not launched.
- Demo typing is deliberately pending under the human's retained Q4 voice/mouth-only confirmation requirement. No evidence is fabricated and no input was injected during automated checks.
- macOS ASCII shortcuts use standard ANSI hardware positions; alternate shortcut layouts need manual checks. Unicode text uses direct Unicode events instead.
- The repository's existing docs ignore rule remains in place; this log and the new ADR are saved locally but need deliberate human inclusion if they are to be committed.

Manual checks for the human
- [ ] Run `pnpm native:build` on macOS and Windows 11, then the matching addon smoke check. Download all three prebuilt artifacts after CI passes.
- [ ] If Electron is missing, run `pnpm rebuild electron` in a normal terminal. Run `pnpm native:demo`, grant Accessibility permission to its Electron host on macOS, and rerun. Confirm the four corners are 20 physical pixels inset; verify pause stops movement.
- [ ] Run `pnpm native:bench` and record its 1,000-call p50/p95. Confirm the pause hotkey aborts the benchmark without emitting more moves.
- [ ] Check display bounds/scale and cursor positions on Retina and Windows 125%/150% scaling, including negative monitor origins.
- [ ] Check mouse buttons, double-click, drag release on pause, both scroll axes, and primary shortcuts in a harmless local test window through the validated wrapper.
- [ ] After a real Q4 confirmation pipeline is available, verify `Hello 你好 =SUM(A1:A3)` plus `: $` and a non-BMP character in a plain text editor and Excel. Check that pause cancels remaining text and a consumed confirmation cannot insert again.

Open-question defaults / decisions used
- Q3 answered: macOS and Windows together.
- Q6 default: the developer demo uses the primary display.
- Q4 retained by the human: voice-confirm or held-mouth-gesture only; developer keyboard confirmation was declined.

Suggested commit message
feat(P1.1): add native input addon and validated pause-aware bridge

## P1.2 — UI element queries — 2026-10-14

Status: implemented; runtime coverage and latency validation pending
Platforms checked: macOS build/tests ☑  Windows cross-compile/Clippy ☑  Windows runtime ☐

What changed
- Added Promise-returning elementAt, elementsNear, and foregroundApp behind one Rust UI backend trait. AX and Windows UIA are owned by a dedicated named worker; napi AsyncTask waits off the JS thread. The bounded queue rejects excess requests and skips expired work.
- Added AX hit-testing, actionable ancestor lookup, nearby sibling/descendant traversal, permission checks, bundle identity, and CF ownership cleanup. Added Windows MTA COM initialization, UIA property/pattern cache requests, control-view traversal, per-monitor DPI scope, process filename/window title, and COM/handle cleanup.
- Added eight shared roles and strict Zod argument/result schemas, a 50-result cap, 200-node traversal cap, and a 15 ms soft traversal budget. The physical-pixel radius converts to Quartz points by the query display scale on macOS.
- Added the pause-aware JS query wrapper with a frozen latest snapshot, synchronous allocation-light cache reads, 500 ms default age limit, foreground checks, timeout/failure invalidation, and rejection of late or superseded responses. No snapping algorithm or app polling loop is added before Phase 2.
- Extended the native mock with a scripted layout, hit/radius queries, foreground identity, Retina conversion, and result capping.
- Implemented the already-listed native:ui-probe command and Electron build entry. It queries at 500 ms intervals without overlap, prints local element data and rolling p50/p95 timings, and retains the global pause hotkey. The existing Commands table already includes this command; Hard rules were untouched.
- Added ADR 0003 with role/coordinate/thread/cache contracts and the requested empty app-coverage table. Extended the smoke checks used by existing macOS/Windows CI to cover query exports, invalid inputs, and Promise permission-denial behavior when permission is absent.

Measured numbers
- `pnpm verify`: lint and typecheck passed; 21 test files / 57 tests passed.
- Rust macOS unit tests: 6 passed, including worker thread ownership, result caps, expired queued work, geometry, and Unicode label truncation.
- `cargo clippy --all-targets -- -D warnings`: passed on macOS and in the Windows MSVC cross-check. `cargo fmt` and `git diff --check` passed.
- Both darwin-arm64 and darwin-x64 addons built and Mach-O architectures were confirmed. The arm64 Node addon passed export/argument rejection and Promise permission-denial smoke checks.
- Electron production build passed, including native-ui-probe and all existing entrypoints.
- Live AX/UIA latency and app coverage are unmeasured. No p95 claim is based on mock tests or compilation.

Known issues / follow-ups
- Windows linking, unit execution, and UIA runtime behavior require existing Windows CI/a teammate. Intel addon loading requires its matching runner or an Intel Mac.
- The Electron runtime binary is unavailable locally (its automatic download failed under restricted network access); the probe was built but not launched. No input was injected during these checks.
- The 15 ms budget is soft: calls to AX/UIA providers already in progress may overrun it. Native waits and the JS wrapper time out after 250 ms by default; a stuck provider can occupy the dedicated worker until host restart without blocking JS. Coverage can be partial after the time/node cap.
- macOS offscreen is an approximation based on display intersection, optional AXHidden, and minimized-window state; occlusion/clipping is not universally available. Grid cells are mapped as spreadsheet cells because platform roles do not identify the host app semantically. Unsupported/custom drawn controls are omitted.
- Foreground changes between refreshes may leave cached results until the 500 ms expiry; subsequent queries check foreground before/after. No query runs from the synchronous cache read.
- The existing docs ignore rule remains: the ADR and this log are saved locally but require deliberate human inclusion if committed. Prebuilt binaries remain ignored and are also built by CI.

Manual checks for the human
- [ ] Run CI for all three native targets; confirm Windows linking/tests/smoke pass and verify the Intel addon loads.
- [ ] In a normal terminal with Electron installed, run `pnpm native:ui-probe` on macOS and Windows 11. On macOS deny Accessibility first, verify the permission guidance, then grant permission to the Electron host and rerun.
- [ ] Probe system settings, a browser, and Microsoft 365 Excel. Check buttons, links, menus, tabs, list items, check boxes, edit fields, and spreadsheet cells against the visible controls. Fill the empty ADR table; record missing/custom controls and disabled/offscreen behavior.
- [ ] Check foreground bundle ID on macOS / process filename on Windows and window titles while switching apps/windows. Test cache failure/pause behavior through the mock unit tests and confirm the live pause hotkey stops probe requests, resumes, and Ctrl+C exits.
- [ ] Collect at least 100 samples per app/platform. Record p50/p95, failures, and unexpected empty results; compare p95 against the <15 ms target. Test an unresponsive app and confirm the Gestura host/pause hotkey remain responsive.
- [ ] Check primary-display Retina and Windows 125%/150% scaling: returned bounds align with the cursor, and radiusPx remains physical pixels. Negative origins/mixed-scale displays need separate coverage before multi-monitor support.

Open-question defaults used
- Q2: TypeScript shared contracts and main wrapper; Rust native implementation only.
- Q3 answered: both macOS and Windows 11.
- Q6: primary-display, DPI/Retina-aware MVP checks.
- Q8: local-only opt-in output; no automatic files, uploads, or telemetry.
- Q4 remains voice/mouth only. P1.1 demo typing is still pending; this step adds no insertion path.

Suggested commit message
feat(P1.2): add asynchronous AX and UIA element queries

### P1.2 changed files

- [apps/desktop/electron.vite.config.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/electron.vite.config.ts>)
- [apps/desktop/package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/package.json>)
- [apps/desktop/src/main/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/index.ts>)
- [apps/desktop/src/main/native/runtime.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/native/runtime.ts>)
- [apps/desktop/src/main/native/tool-runtime.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/native/tool-runtime.ts>)
- [native/gestura-native/Cargo.lock](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/Cargo.lock>)
- [native/gestura-native/Cargo.toml](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/Cargo.toml>)
- [native/gestura-native/index.d.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/index.d.ts>)
- [native/gestura-native/mock/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/mock/index.ts>)
- [native/gestura-native/package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/package.json>)
- [native/gestura-native/scripts/smoke.mjs](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/scripts/smoke.mjs>)
- [native/gestura-native/src/lib.rs](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/src/lib.rs>)
- [native/gestura-native/src/macos/mod.rs](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/src/macos/mod.rs>)
- [native/gestura-native/src/windows/mod.rs](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/src/windows/mod.rs>)
- [package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/package.json>)
- [packages/core/src/config/index.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/config/index.test.ts>)
- [packages/core/src/config/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/config/index.ts>)
- [packages/core/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/index.ts>)
- [pnpm-lock.yaml](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/pnpm-lock.yaml>)
- [apps/desktop/src/main/native/ui-elements.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/native/ui-elements.test.ts>)
- [apps/desktop/src/main/native/ui-elements.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/native/ui-elements.ts>)
- [apps/desktop/src/main/native/ui-probe.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/native/ui-probe.ts>)
- [native/gestura-native/src/macos/ui.rs](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/src/macos/ui.rs>)
- [native/gestura-native/src/ui.rs](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/src/ui.rs>)
- [native/gestura-native/src/windows/ui.rs](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/native/gestura-native/src/windows/ui.rs>)
- [packages/core/src/ui-elements.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/ui-elements.test.ts>)
- [packages/core/src/ui-elements.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/ui-elements.ts>)
- [docs/decisions/0003-ui-element-coverage.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/decisions/0003-ui-element-coverage.md>)
- [docs/PROGRESS.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/PROGRESS.md>)

## P2.1 — Face tracking and fixtures — 2026-10-14

Status: partial (implementation verified; live camera/GPU checks pending)
Platforms checked: macOS ☑ (build/unit/fixture UI)  Windows ☐ (runtime)

What changed
- Implemented models:fetch with Google's versioned .task model, a pinned SHA-256, safe installation, and matching local WASM bundling for dev/packaged apps. Generated assets remain ignored. The existing Commands table already lists models:fetch; Hard rules were untouched.
- Pinned tasks-vision 0.10.32 after rejecting current 1.1.0's automatic usage logging. Added a version/logger-signature build guard. Documented the dependency choice, frame clock, privacy, permissions, and replay behavior in ADR 0004.
- Added the hidden camera/GPU VIDEO pipeline, one-face landmarks/blendshapes/matrix conversion, typed FaceFrame schemas and sender-specific IPC, local app://vision asset serving, and video-only vision permission handling. Pause/stop release media/GPU resources and reject late initialization; main drops paused frames.
- Added the control debug panel, live processed fps/inference percentiles, detection/three score bars, accessible/dwell buttons, and scripted record/save/cancel/replay UI. Both live and replay sources use the same main frame stream.
- Implemented tools/replay recorder/player with exact prompt intervals, pause-aware original timing, derived JSONL and labels, and strictly validated local files. Explicit recordings save to userData/fixtures/<uuid>; no pixels/audio or training collection. Added a clearly labelled synthetic landmark fixture.

Measured numbers
- `pnpm verify`: lint/typecheck passed; 28 test files and 82 tests passed.
- Production Electron build passed for main, preload, all three renderers, and existing native tool entrypoints. Model/WASM bundles were checksum/SDK checked.
- Model: 3,758,596 bytes; SHA-256 64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff. Download/verification passed; subsequent models:fetch reused and reverified the cache.
- Synthetic browser UI click-through passed all six operations and keyboard activation with no warning/error console entries. Narrow viewport had no horizontal overflow; buttons measured 51.996 px high. Text contrast ratios were 6.55:1 or higher.
- No real camera fps or GPU inference p50/p95 has been measured. Screenshot values are explicitly synthetic.

Known issues / follow-ups
- Electron's runtime binary remains unavailable in this sandbox. Live camera permission, local app-protocol/WASM loading, GPU inference, hidden-window capture, and Windows behavior require the manual checks below. Browser UI checks used a synthetic preload substitute, not Electron.
- Capture requests 1280x720/60 fps (minimum 30), and displays actual negotiated settings. Slow inference can skip camera frames; processed fps is reported. tCapture starts at decoded-frame inference entry, not sensor exposure.
- Current tasks-vision 1.1.0 is deliberately excluded because of its automatic logger. Any SDK upgrade needs source review, beyond the guard against known logging signatures.
- Recording buffers at most 20,000 frames; replay loads at most 200 MB. Saved fixture pairs use new directories and never overwrite user files. An I/O failure may leave an incomplete pair for the human to inspect.
- The global pause gesture remains a later gesture-pipeline step; the existing hotkey works through the shared pause controller. No pointer/gesture recognizer or speech capture is added here.
- Workflow work remains deferred as requested. Existing docs ignore rule is preserved; this progress entry, ADR, and UI check report require deliberate human inclusion if committed.

Manual checks for the human
- [ ] Run `pnpm models:fetch`, then `pnpm dev` on macOS and Windows with Electron installed. Confirm the model/WASM remain local and the vision window stays hidden.
- [ ] Deny then grant camera permission; confirm only vision can request video and no microphone prompt appears. Start/stop tracking and verify the camera indicator turns off on stop/pause.
- [ ] Check 1280x720 and negotiated fps, GPU errors, live detection and subject-left/right blink plus jaw-open bars. Record real processed fps and inference p50/p95; compare inference p95 to the <=25 ms pipeline target.
- [ ] Press Ctrl+Option+P / Ctrl+Alt+P during initialization, tracking, recording, and replay. Confirm capture/inference/data flow stop, prompt/playback timing pauses, and stop/cancel remain available.
- [ ] Record all eight prompts. Inspect the printed local directory: only frames.jsonl and labels.json, with fixed arrays and valid start/end intervals. Replay it and confirm original timing. Test cancel, camera disconnect, missing/corrupt model, and malformed fixture handling.
- [ ] Replay fixtures/landmarks/p2.1-synthetic.jsonl with camera access denied. Verify the expected face loss/blink/wink/jaw states without using a camera.
- [ ] Check keyboard and one-second pointer dwell on every control, reduced motion, and narrow window layout. Live dwell-driven cursor movement belongs to Phase 2's later input steps.

Open-question defaults used
- Q2: TypeScript shared logic/main/renderer, with existing native interface unchanged.
- Q3 answered: macOS and Windows 11; teammate runtime check is pending.
- Q8: local-only opt-in derived recordings, user-managed/deletable files, no uploads.
- Q4: voice/mouth confirmation stays unchanged; no dictated/generated insertion exists here.

Suggested commit message
feat(P2.1): add local face tracking and scripted fixture replay

### P2.1 changed files

- [.gitignore](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/.gitignore>)
- [apps/desktop/electron-builder.yml](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/electron-builder.yml>)
- [apps/desktop/electron.vite.config.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/electron.vite.config.ts>)
- [apps/desktop/package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/package.json>)
- [apps/desktop/src/main/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/index.ts>)
- [apps/desktop/src/preload/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/preload/index.ts>)
- [apps/desktop/src/preload/types.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/preload/types.ts>)
- [apps/desktop/src/renderer/control/main.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/control/main.tsx>)
- [apps/desktop/src/renderer/shared/styles.css](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/shared/styles.css>)
- [apps/desktop/src/renderer/vision/index.html](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/vision/index.html>)
- [apps/desktop/src/renderer/vision/main.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/vision/main.tsx>)
- [eslint.config.mjs](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/eslint.config.mjs>)
- [package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/package.json>)
- [packages/core/src/config/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/config/index.ts>)
- [packages/core/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/index.ts>)
- [pnpm-lock.yaml](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/pnpm-lock.yaml>)
- [tools/replay/package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/replay/package.json>)
- [tools/replay/src/index.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/replay/src/index.test.ts>)
- [tools/replay/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/replay/src/index.ts>)
- [tools/replay/tsconfig.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/replay/tsconfig.json>)
- [apps/desktop/src/main/vision/assets.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/assets.ts>)
- [apps/desktop/src/main/vision/controller.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/controller.test.ts>)
- [apps/desktop/src/main/vision/controller.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/controller.ts>)
- [apps/desktop/src/main/vision/ipc-policy.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/ipc-policy.ts>)
- [apps/desktop/src/main/vision/metrics.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/metrics.ts>)
- [apps/desktop/src/main/vision/permissions.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/permissions.ts>)
- [apps/desktop/src/main/vision/policy.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/policy.test.ts>)
- [apps/desktop/src/main/vision/replay-files.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/replay-files.test.ts>)
- [apps/desktop/src/main/vision/replay-files.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/replay-files.ts>)
- [apps/desktop/src/renderer/control/DebugPanel.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/control/DebugPanel.tsx>)
- [apps/desktop/src/renderer/vision/camera.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/vision/camera.test.ts>)
- [apps/desktop/src/renderer/vision/camera.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/vision/camera.ts>)
- [apps/desktop/src/renderer/vision/convert.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/vision/convert.ts>)
- [fixtures/landmarks/README.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/fixtures/landmarks/README.md>)
- [fixtures/landmarks/p2.1-synthetic.jsonl](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/fixtures/landmarks/p2.1-synthetic.jsonl>)
- [fixtures/landmarks/p2.1-synthetic.labels.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/fixtures/landmarks/p2.1-synthetic.labels.json>)
- [packages/core/src/face-frame.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/face-frame.test.ts>)
- [packages/core/src/face-frame.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/face-frame.ts>)
- [scripts/fetch-models.mjs](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/scripts/fetch-models.mjs>)
- [scripts/model-assets.d.mts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/scripts/model-assets.d.mts>)
- [scripts/model-assets.mjs](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/scripts/model-assets.mjs>)
- [tools/replay/src/fixture.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/replay/src/fixture.test.ts>)
- [tools/replay/src/model-assets.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/replay/src/model-assets.test.ts>)
- [docs/decisions/0004-local-face-tracking.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/decisions/0004-local-face-tracking.md>)
- [docs/p2.1-ui-checks.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/p2.1-ui-checks.md>)
- [docs/PROGRESS.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/PROGRESS.md>)

## P2.2 — Head pointer pipeline and coarse gaze — 2026-10-14

Status: partial (implementation verified; live cursor/latency checks pending)
Platforms checked: macOS ☑ (TypeScript tests/build/synthetic browser UI)  Windows ☐ (runtime)

What changed
- Replaced the pointer stub with pure matrix-to-pose extraction, neutral/dead-zone/nonlinear-gain mapping, primary-display clamping and per-axis One Euro filters. Added coarse iris gaze estimation, head correction, stable/distant jump logic and head re-anchoring. The main controller keeps live gaze disabled until calibration exists.
- Added strict shared schemas/defaults, pointer IPC contracts, tunable userData config/profile settings, physical-pixel mapping and conversion to macOS points at native dispatch. Native Windows coordinates remain DPI-aware pixels. Added only workspace dependency links; no new external dependency.
- Connected the existing FaceFrame bus to an opt-in main pointer controller through NativeBridge.moveTo. Permission/native errors are visible; pause, stale/future/duplicate frames, face loss, tracking stop and display changes suppress movement. Pause/resume rejects pre-resume captures; a watchdog clears expired metrics. Replay previews never inject native input.
- Added capture/inference/pointer/send stamps and rolling nearest-rank capture-to-send p50/p95 in the existing accessible debug panel. Gaze defaults off; profile defaults to zero neutral offsets until calibration.
- Added synthetic hold-still/head-sweep JSONL and paired labels in the P2.1 format, retained P2.1 determinism coverage, and added unit tests for equations, signals, gaze timing/distance, coordinate conversion, contracts and mock native dispatch.
- Documented coordinate/matrix/filter/gaze/timing conventions in ADR 0005 and synthetic UI checks in p2.2-ui-checks.md. No scripts added; Commands and Hard rules were unchanged. Workflow work remains deferred.

Measured numbers
- Final `pnpm verify`: lint/typecheck passed; 35 test files / 117 tests passed.
- Electron production build passed for main, preload, all renderers and existing native tool entries. Existing Zod/Rollup comment-annotation warnings remain harmless build warnings.
- Synthetic hold-still jitter: 0.0790 px RMS at 1920×1080, about the mean after 60 warm-up frames; starting threshold 3 px.
- Synthetic filtered sweep bounds: left ≈0, right 1919, top ≈0, bottom ≈1079; all four edges reached within 1 physical pixel. Same fixtures produce exactly identical commands/timestamps on repeat.
- Synthetic browser UI: click enable / keyboard Enter disable passed; 7 buttons measured 52 px high; 375 px viewport had 360 px content width and no overflow; no warning/error console entries.
- No real-user jitter, GPU/head-direction check or live capture-to-cursor p95 was measured. Screenshot latency values are explicitly synthetic. Native OS delivery is outside tMoveSent.

Known issues / follow-ups
- Camera/live Electron/native cursor checks and Windows runtime verification remain human checks. Real camera sign conventions, ease of reaching edges, and the <100 ms live p95 target are not established by synthetic fixtures.
- Calibration UI is a later step. Current neutral/profile and gain/filter settings come from validated local config, applied on restart. Coarse gaze is heuristic and disabled in main even if its future config switch is set; pure tests exercise it explicitly.
- Q6 remains primary-only. A display configuration change disables pointer control until re-enabled. Mixed-monitor movement/snapping and click gestures are later steps.
- Pause gesture recognition remains the later gesture step; P2.2 uses the existing globally available pause hotkey and shared state.
- Existing docs ignore rule is preserved: this log, ADR and UI report are saved locally but need deliberate human inclusion if committed. Native binaries and build outputs remain ignored. Nothing was committed or pushed.

Manual checks for the human
- [ ] Run `pnpm native:build`, then `pnpm dev` with Electron installed. On macOS grant Accessibility to the Electron host in System Settings; confirm missing/denied permission produces panel guidance. Check Windows 11 through a teammate.
- [ ] Start camera tracking, then Enable pointer control. Move the head left/right/up/down; verify direction and reachability of all four primary-screen edges. Adjust `pointerProfile.neutral` and gain/ranges in local userData/config.json if needed; restart. Do not enable gaze before calibration.
- [ ] Hold still outside the dead zone and record a local derived fixture. Measure actual jitter; compare against 3 px RMS. Record live capture-to-move p50/p95 and compare p95 against <100 ms. This clock starts at decoded-frame inference entry, not sensor exposure.
- [ ] Press Ctrl+Option+P / Ctrl+Alt+P while moving. Confirm no cursor moves during pause, camera pauses, and only fresh post-resume frames move. Hide the face, stop tracking, disable pointer control and interrupt tracking; confirm movement stops and metrics clear.
- [ ] Check Retina and Windows 125%/150% scaling: movement stays on the primary display and aligns with its physical edges. Change display configuration and verify pointer control disables until re-enabled.
- [ ] Replay a fixture with pointer enabled; verify preview coordinates appear and the real cursor does not move. Test enable/disable by keyboard and dwell, with a narrow control window.

Open-question defaults used
- Q5: head pose for fine control, coarse gaze jumps; live gaze remains off until calibration.
- Q6: primary monitor only, Retina/DPI-aware.
- Q8: no automatic logs or media files added; fixture data is synthetic/derived and recordings stay local.

Suggested commit message
feat(P2.2): add pure pointer pipeline and pause-aware native dispatch

### P2.2 changed files

- [apps/desktop/electron.vite.config.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/electron.vite.config.ts>)
- [apps/desktop/package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/package.json>)
- [apps/desktop/src/main/config.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/config.test.ts>)
- [apps/desktop/src/main/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/index.ts>)
- [apps/desktop/src/main/pointer/controller.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/pointer/controller.test.ts>)
- [apps/desktop/src/main/pointer/controller.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/pointer/controller.ts>)
- [apps/desktop/src/main/vision/ipc-policy.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/ipc-policy.ts>)
- [apps/desktop/src/main/vision/policy.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/policy.test.ts>)
- [apps/desktop/src/renderer/control/DebugPanel.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/control/DebugPanel.tsx>)
- [docs/PROGRESS.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/PROGRESS.md>)
- [docs/decisions/0005-pointer-pipeline.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/decisions/0005-pointer-pipeline.md>)
- [docs/p2.2-ui-checks.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/p2.2-ui-checks.md>)
- [fixtures/landmarks/README.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/fixtures/landmarks/README.md>)
- [fixtures/landmarks/p2.2-head-sweep.jsonl](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/fixtures/landmarks/p2.2-head-sweep.jsonl>)
- [fixtures/landmarks/p2.2-head-sweep.labels.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/fixtures/landmarks/p2.2-head-sweep.labels.json>)
- [fixtures/landmarks/p2.2-hold-still.jsonl](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/fixtures/landmarks/p2.2-hold-still.jsonl>)
- [fixtures/landmarks/p2.2-hold-still.labels.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/fixtures/landmarks/p2.2-hold-still.labels.json>)
- [packages/core/src/config/index.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/config/index.test.ts>)
- [packages/core/src/config/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/config/index.ts>)
- [packages/core/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/index.ts>)
- [packages/core/src/pointer.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/pointer.test.ts>)
- [packages/core/src/pointer.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/pointer.ts>)
- [packages/pointer/package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/package.json>)
- [packages/pointer/src/gaze.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/gaze.test.ts>)
- [packages/pointer/src/gaze.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/gaze.ts>)
- [packages/pointer/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/index.ts>)
- [packages/pointer/src/one-euro.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/one-euro.test.ts>)
- [packages/pointer/src/one-euro.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/one-euro.ts>)
- [packages/pointer/src/pipeline.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/pipeline.test.ts>)
- [packages/pointer/src/pose.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/pose.test.ts>)
- [packages/pointer/src/pose.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/pose.ts>)
- [packages/pointer/src/test-frames.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/test-frames.ts>)
- [pnpm-lock.yaml](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/pnpm-lock.yaml>)
- [tools/replay/src/pointer-fixtures.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/replay/src/pointer-fixtures.test.ts>)

## P2.3 — First-run calibration wizard — 2026-10-14

Status: partial (implementation verified; live hands-free onboarding/accuracy checks pending)
Platforms checked: macOS ☑ (TypeScript tests/build/synthetic UI)  Windows ☐ (runtime)

What changed
- Added the six-screen first-run wizard: framing/lighting checks, three-second neutral, four comfortable motion directions, optional nine-dot/1.5-second gaze capture, three long blinks plus ten seconds of natural blinking, and five dwell-selected test targets. The running elapsed timer includes pauses/retries; capture timers freeze on pause.
- Added pure calibration state/maths, asymmetric head ranges, eye-local/head iris features, standardized ridge regression and fitted gaze prediction in packages/pointer. Invalid/insufficient captures provide retry/disable routes; no model SDK or new external dependency was added.
- Added versioned shared profile/state/control/diagnostic schemas and defaults. The profile stores neutral/ranges/filter settings, gaze mapping, blink thresholds for P2.4, display metadata, duration and logging preference; no raw frames/audio are saved.
- Added full-screen primary-display setup and an internal head/dwell pointer using default gains and a provisional neutral before calibration. Native input is disabled during setup; wizard selections never inject OS clicks. Saving explicitly starts calibrated head control when native permission is available. Saved calibrated gaze can be disabled/re-enabled without recalibrating.
- Added main profile loading/validation, atomic JSON replacement in userData, visible errors, opt-in metadata-only duration logging and a clear-log control. Missing/invalid profiles trigger first run; cancel/write failures preserve an existing saved profile. Display changes cancel setup; closing an active wizard stops capture.
- Added scalar lighting diagnostics inside the capture process, derived framing warnings and trusted sender/IPC validation. The small sampled canvas is cleared and never crosses IPC; no preview pixels are sent to control.
- Added ADR 0006 and P2.3 UI check notes. P2.2's uncommitted work is retained. No root scripts, Commands, Hard rules, native Rust or workflow changes in P2.3.

Measured numbers
- Final `pnpm verify`: lint/typecheck passed; 40 test files / 141 tests passed.
- Production Electron build passed for main, preload, all renderers and native tool entries. Existing Zod comment-annotation warnings remain benign.
- Synthetic affine regression was recovered within 0.001 normalized-unit tolerance; constant/correlated features, nonfinite inputs and uninformative fits are tested. No real gaze accuracy was measured.
- Entire head-only scripted runtime, including five dwell hits and persistence: 40.65 s on an injected clock. This is not a measured human onboarding result or proof of the <2 minute target.
- Synthetic UI: virtual-pointer dwell reached Neutral pose; keyboard gaze/save controls and all screen headings passed. Wizard buttons measured at least 72 px high; test/gaze targets are 96×96 px. At 375×812, framing controls ended at y=570.97; quick-test buttons ended at y=776 and help started at y=792.80, with no overlap/horizontal overflow. No captured warning/error console entries.
- No camera, microphone or native input was activated in these checks. Lighting, actual pose signs, calibrated gaze accuracy, false-click rates and live onboarding duration remain unmeasured.

Known issues / follow-ups
- Real macOS/Windows camera and full-screen behavior, permission handling, complete unaided head/dwell operation and profile application need the human checks below. OS permission prompts require manual setup.
- Lighting is a coarse mean-luminance heuristic and may miss backlighting/uneven facial illumination. Gaze fit residual is a sanity check, not an accuracy/held-out validation result. Natural-blink sampling is only ten seconds; P2.4 must validate actual false-click behavior.
- Calibration requires continuous usable frames during timed captures; face loss/lighting failure restarts an interrupted capture. Primary-display changes invalidate an active session. Mixed-monitor support is outside Q6.
- Global pause gesture recognition remains in the later gesture step. Existing pause hotkey/state applies throughout calibration, capture and native dispatch. No speech, OS click recognizer or GenAI confirmation was added.
- Profile writes use a unique temporary file and rename; a failed write/rename can leave a private parameter-only .tmp file. Duration logging failure does not lose a saved profile. Logs are local, explicit opt-in and clearable; there is no automatic export.
- Existing docs ignore rule remains: this progress entry, ADR and UI report need deliberate human inclusion if committed. All changes remain uncommitted.

Manual checks for the human
- [ ] Run `pnpm native:build` / `pnpm dev` with models/Electron installed on macOS and Windows. Grant camera/Accessibility prerequisites manually. With no valid profile, confirm first-run setup appears on the primary display; with a valid profile, confirm it loads and Recalibrate is available.
- [ ] Complete every in-app step using head movement and dwell only. Check the timer, three-second neutral, comfortable four-direction captures, gain coverage, defaults before calibration, and keyboard/mouse fallback. Do not strain to reach targets.
- [ ] Check face centering/clipping and dim/bright-light warnings without any transmitted preview. Cover/move the face during captures; confirm interruption/retry and no stale dwell/blink completion.
- [ ] Leave gaze off and verify the screen is skipped. Repeat with gaze on, confirm nine dots/1.5-second captures, then try calibrated coarse jumps and head fine control. Disable/re-enable fitted gaze from control. Record actual accuracy; retry or leave gaze off if unreliable.
- [ ] Capture three deliberate long blinks and ten seconds of natural blinking. Inspect saved hysteresis/duration thresholds, but do not interpret this as a false-click test; P2.4 supplies that recognizer/validation.
- [ ] Select all five targets by dwell and save/start head control. Verify primary display/Retina/Windows scaling, profile reuse on restart, camera state and Accessibility-denied guidance. Confirm original control-window bounds return after save/cancel.
- [ ] Pause during each step with Ctrl+Option+P / Ctrl+Alt+P; confirm capture timers freeze and no native movement occurs. Resume, cancel, close control or change displays; check safe reset/stop behavior.
- [ ] Inspect userData/calibration-profile.json: parameters and duration only. Confirm calibration-durations.jsonl is absent with logging off, contains only createdAt/durationMs after opt-in, and can be cleared. Try an invalid profile/write failure and confirm a visible retry route without replacing an existing valid profile.
- [ ] Measure actual total wizard time from start through save on both platforms; compare with the <2 minute unaided setup target.

Open-question defaults used
- Q5: head fine control plus optional calibrated gaze; gaze starts off and can be skipped/switched off.
- Q6: primary display only, DPI/Retina-aware.
- Q7: 400 ms starting deliberate long blink; learned thresholds are stored for P2.4 and do not trigger clicks here.
- Q8: local duration log requires explicit opt-in and is user-clearable. Total duration is also profile metadata, as requested.

Suggested commit message
feat(P2.3): add hands-free calibration wizard and local profiles

### P2.3 changed files

- [apps/desktop/src/main/calibration/controller.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/calibration/controller.test.ts>)
- [apps/desktop/src/main/calibration/controller.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/calibration/controller.ts>)
- [apps/desktop/src/main/calibration/store.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/calibration/store.test.ts>)
- [apps/desktop/src/main/calibration/store.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/calibration/store.ts>)
- [apps/desktop/src/main/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/index.ts>)
- [apps/desktop/src/main/pointer/controller.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/pointer/controller.ts>)
- [apps/desktop/src/main/vision/ipc-policy.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/ipc-policy.ts>)
- [apps/desktop/src/main/vision/policy.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/policy.test.ts>)
- [apps/desktop/src/renderer/control/CalibrationWizard.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/control/CalibrationWizard.tsx>)
- [apps/desktop/src/renderer/control/DebugPanel.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/control/DebugPanel.tsx>)
- [apps/desktop/src/renderer/control/main.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/control/main.tsx>)
- [apps/desktop/src/renderer/shared/styles.css](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/shared/styles.css>)
- [apps/desktop/src/renderer/vision/camera.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/vision/camera.test.ts>)
- [apps/desktop/src/renderer/vision/camera.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/vision/camera.ts>)
- [apps/desktop/src/renderer/vision/main.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/vision/main.tsx>)
- [docs/PROGRESS.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/PROGRESS.md>)
- [docs/decisions/0006-first-run-calibration.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/decisions/0006-first-run-calibration.md>)
- [docs/p2.3-ui-checks.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/p2.3-ui-checks.md>)
- [packages/core/src/calibration.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/calibration.test.ts>)
- [packages/core/src/calibration.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/calibration.ts>)
- [packages/core/src/config/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/config/index.ts>)
- [packages/core/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/index.ts>)
- [packages/core/src/pointer.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/pointer.ts>)
- [packages/pointer/src/calibration-fixture.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/calibration-fixture.ts>)
- [packages/pointer/src/calibration.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/calibration.test.ts>)
- [packages/pointer/src/calibration.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/calibration.ts>)
- [packages/pointer/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/index.ts>)
- [packages/pointer/src/pose.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/pose.test.ts>)
- [packages/pointer/src/pose.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/pose.ts>)
- [packages/pointer/src/regression.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/regression.test.ts>)
- [packages/pointer/src/regression.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/regression.ts>)

## P2.4 — Click gestures and pause overlay — 2026-10-15

Status: implementation verified; live gesture accuracy and cross-platform runtime checks pending
Platforms checked: macOS (TypeScript tests/build/synthetic browser); Windows runtime pending

What changed
- Added pure independent eye hysteresis, calibrated blendshape thresholds, aspect-correct relative EAR fallback from neutral calibration, bilateral onset synchronization and reopen classification. Long bilateral blinks (400 ms minimum, profile-tunable; 1500 ms default maximum) click left; left winks of at least 250 ms click right; right winks emit diagnostics. Natural/overlong/asynchronous/fluttering closures never click.
- Added one-shot dwell mode (24 px/1000 ms defaults), speed suppression, cooldown, lost/stale/unknown-signal resets and internal balanced mouseDown/mouseUp drag events for Phase 3. Click modes default off and require calibration.
- Added immutable onset-position freeze through reopening, pointer-filter timestamp holding, and native move-before-click at the frozen position. NativeBridge validation/pause protections remain intact; held drag releases on pause, face loss, disable and source reset. Replay never injects gestures/input. No blink/wink/dwell path confirms ActionGate actions.
- Added jaw-held toggleListening events with an explicit silent/speaking/unknown contract and mouth-motion click suppression. Runtime remains unknown, so listening toggles await Phase 3. Facial dynamics alone cannot establish silence or prove zero clicks for all talking.
- Added typed/validated gesture control and feedback IPC, control mode selection, overlay cursor/freeze/dwell/click rings and a reserved 72 px corner pause target. Mode-aware control dwell prevents duplicate automatic button activation alongside native clicks.
- Added corner dwell pause/resume with exit-to-rearm. The approved pause behavior retains camera/model locally at 5 fps only for virtual head-cursor resume; native input, normal recognition, recording and replay stay paused. Stop Tracking releases camera/model. Both control and overlay disclose camera activity. The virtual cursor preserves access to all edges from its paused anchor.
- Added labelled synthetic JSONL and evaluation, EAR/profile/config/policy tests, native mock dispatch and head-only corner tests. Added ADR 0007 and UI report. No external dependencies, root scripts, Commands table, Hard rules, native Rust or workflows changed. Workspace links for core/gestures were updated; final offline relink reused 346 packages and downloaded zero after the sandbox could not hard-link the store.

Measured numbers
- Final `pnpm verify`: lint/typecheck passed, 44 test files / 165 tests passed.
- Final `pnpm --filter @gestura/desktop exec electron-vite build`: passed. Existing upstream Zod comment annotation warnings remain.
- `git diff --check`: passed.
- Labelled synthetic replay: deliberate long blinks 5/5 (100%); left-wink detection 5/5 (100%); natural and silent-reading clicks/min 0; simulated talking clicks 0. These scripted signals are not human accuracy measurements. Negative segments last ten seconds each; rates are extrapolated.
- Browser UI with a synthetic bridge: mode changes, control pause and keyboard overlay pause passed; corner 72×72 px, mode controls at least 52 px high; no horizontal overflow at desktop/375×812; no captured console warnings/errors. Click/frozen/dwell rings verified. UI delivery checks PASS in `docs/p2.4-ui-checks.md`.

Known issues and follow-ups
- No live camera or native injection was activated during agent checks. Actual blink/wink recall, talking false clicks, EAR robustness, end-to-end OS latency and overlay click-through need human checks on both macOS and Windows. Do not claim the 95% recall/zero-talking target from synthetic numbers.
- Listening-toggle runtime integration and voice-controlled drag await Phase 3 speech state. Current jaw unknown state deliberately cannot toggle listening.
- Existing profiles lack optional EAR baselines; recalibrate to enable landmark fallback. Incompatible calibrated blink minimum/configured maximum turns blink mode off with an explanation.
- Pause leaves the camera indicator on for local head resume. Stop Tracking turns it off and requires another route (hotkey/control) to resume tracking.
- `docs/` remains gitignored by the maintainer's choice; include its updates deliberately when preparing the human commit.

Manual checks for the human
1. Run `pnpm native:build`, `pnpm models:fetch`, `pnpm dev`; grant required permissions, recalibrate, save and enable pointer control. Select blink mode in Click gestures.
2. In a safe target-practice window, verify a deliberate long blink clicks once at the onset location, left wink right-clicks once, right wink does not click, natural blinks do not click, and rapid cursor travel suppresses clicks. Test varying lighting, glasses and the long-blink maximum.
3. Read aloud and talk naturally while blinking. Record consented feature-only fixtures and label actual closure intervals; evaluate false clicks and recall before accepting performance targets. No images/audio should be saved.
4. Select dwell mode; verify progress, one click after holding still, exit-to-repeat, and no duplicate button activations. Try both control window and another application.
5. Dwell in the top-right corner to pause, verify native cursor/clicks stop, move the virtual head cursor out and back to resume. Repeat using Ctrl+Option+P (macOS) / Ctrl+Alt+P (Windows). Verify no immediate retoggle while remaining in the corner; Stop Tracking turns the camera indicator off.
6. Check overlay transparency/click-through, cursor/ring alignment on Retina/Windows scaling, and primary-display changes. The Windows teammate must repeat runtime checks. Listening/voice drag are pending Phase 3.

Changed files (P2.4 working tree and ignored documentation)
- [apps/desktop/electron.vite.config.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/electron.vite.config.ts>)
- [apps/desktop/package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/package.json>)
- [apps/desktop/src/main/calibration/controller.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/calibration/controller.ts>)
- [apps/desktop/src/main/config.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/config.test.ts>)
- [apps/desktop/src/main/gestures/overlay.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/gestures/overlay.test.ts>)
- [apps/desktop/src/main/gestures/overlay.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/gestures/overlay.ts>)
- [apps/desktop/src/main/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/index.ts>)
- [apps/desktop/src/main/pointer/controller.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/pointer/controller.test.ts>)
- [apps/desktop/src/main/pointer/controller.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/pointer/controller.ts>)
- [apps/desktop/src/main/vision/ipc-policy.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/ipc-policy.ts>)
- [apps/desktop/src/main/vision/policy.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/policy.test.ts>)
- [apps/desktop/src/renderer/control/DebugPanel.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/control/DebugPanel.tsx>)
- [apps/desktop/src/renderer/overlay/GestureOverlay.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/overlay/GestureOverlay.tsx>)
- [apps/desktop/src/renderer/overlay/main.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/overlay/main.tsx>)
- [apps/desktop/src/renderer/shared/styles.css](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/shared/styles.css>)
- [apps/desktop/src/renderer/vision/camera.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/vision/camera.test.ts>)
- [apps/desktop/src/renderer/vision/camera.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/vision/camera.ts>)
- [docs/PROGRESS.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/PROGRESS.md>)
- [docs/decisions/0007-click-gestures.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/decisions/0007-click-gestures.md>)
- [docs/p2.4-ui-checks.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/p2.4-ui-checks.md>)
- [fixtures/landmarks/p2.4-gestures-synthetic.jsonl](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/fixtures/landmarks/p2.4-gestures-synthetic.jsonl>)
- [fixtures/landmarks/p2.4-gestures-synthetic.labels.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/fixtures/landmarks/p2.4-gestures-synthetic.labels.json>)
- [fixtures/landmarks/p2.4-gestures-synthetic.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/fixtures/landmarks/p2.4-gestures-synthetic.md>)
- [packages/core/src/calibration.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/calibration.ts>)
- [packages/core/src/config/index.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/config/index.test.ts>)
- [packages/core/src/config/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/config/index.ts>)
- [packages/core/src/gestures.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/gestures.test.ts>)
- [packages/core/src/gestures.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/gestures.ts>)
- [packages/core/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/index.ts>)
- [packages/gestures/package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/gestures/package.json>)
- [packages/gestures/src/eyes.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/gestures/src/eyes.ts>)
- [packages/gestures/src/gestures.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/gestures/src/gestures.test.ts>)
- [packages/gestures/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/gestures/src/index.ts>)
- [packages/pointer/src/calibration-fixture.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/calibration-fixture.ts>)
- [packages/pointer/src/calibration.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/calibration.test.ts>)
- [packages/pointer/src/calibration.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/calibration.ts>)
- [packages/pointer/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/pointer/src/index.ts>)
- [pnpm-lock.yaml](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/pnpm-lock.yaml>)
- [tools/replay/src/gesture-fixtures.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/replay/src/gesture-fixtures.test.ts>)

Suggested commit message: `feat(P2.4): add calibrated click gestures and pause overlay`
Changes left uncommitted for the human.

## P2.5 — Local pointing benchmark — 2026-10-15

Status: implementation verified; human performance measurements and OS runtime checks pending
Platforms checked: macOS TypeScript/build/synthetic browser; Windows runtime pending

What changed
- Added tools/pointing-bench geometry, deterministic trial engine and summary logic. Mode A uses stride-six multidirectional selection around 13 positions at each of 16/24/32/48 CSS px (52 trials). Mode B uses 30 inert toolbar/menu/tab/link/cell controls, including sixteen 68×20 px spreadsheet cells. No formal ISO-conformance claim is made.
- Added core Zod benchmark config/defaults, trial/session/state/control schemas and trusted-control-only IPC. Records include target bounds, scale, click position/button, active selection time, hit/miss/timeout, individual latency samples and dropped-sample counts. Unfinished cancelled trials are excluded.
- Added the existing-control-window benchmark view with exact small target hitboxes, normal ≥48 px setup/pause/delete controls, hidden/inert background settings, visible opt-in saving and deletion. Every selection attempt ends a trial; other targets/header/background count as misses. Session controls are excluded. Global pause excludes paused time/clicks/samples; resize, focus loss and display changes end partial sessions.
- Added an optional scalar callback for each successful live native move. Benchmark sessions consume capture-to-move-sent samples directly; replay/paused/disabled/idle runs contribute no latency. No filesystem work occurs on the cursor path. Missing latency reports N/A.
- Added pnpm bench:pointing to build/launch the desktop harness, using Electron's single-instance forwarding to reuse a running pipeline. Added queued opt-in local session.json, summary.json and summary.md writes under userData/pointing-bench; these replace the previous saved run. Delete removes only owned files plus memory. Shutdown waits for pending reports; write/delete errors are visible.
- Summary groups by mode and full target dimensions: hits/all trials, misses/click attempts, successful-trial median, and individual-sample nearest-rank p50/p95. Metadata distinguishes device scales; do not pool differently scaled runs.
- Added usage/protocol notes, ADR 0008 and UI check report. Updated only the Commands table description in AGENTS.md; Hard rules unchanged. No external dependencies, native Rust, vision/AI features or workflow changes. Workspace linking reused cached dependencies with zero downloads.

Measured numbers
- Final pnpm verify: lint/typecheck passed; 47 test files / 180 tests passed.
- Final electron-vite production build passed for main, preload and all renderers. Existing upstream Zod annotation warnings remain benign.
- git diff --check passed. Synthetic complete-run tests cover exactly 52 standard and 30 realistic trials; metrics tests check explicit denominators, timeout N/A, paused time, per-target latency, buffer caps and deterministic geometry.
- Store tests verify real temporary JSON/Markdown output, no writes without opt-in, deletion after in-flight saves, preservation of unrelated files, visible storage failures and shutdown settling. Native mock tests verify per-move latency export without replay/paused samples.
- Synthetic browser checks: 16×16 px initial standard target, all realistic cells 20 px high, successful hit progression, off-target miss, pause/resume, partial reports, saving toggle/delete, resize cancellation and no horizontal overflow at desktop/375×812. Mobile session buttons 52–66 px high; final fresh tab had zero captured warnings/errors. UI checks PASS in docs/p2.5-ui-checks.md.
- No real hit rate, false-click rate, median selection time or live pipeline p95 was measured. Browser-check timing is synthetic interaction evidence only.

Known issues / follow-ups
- Electron/native runtime, single-instance forwarding, app/window-close write completion and Windows DPI/file behavior require human checks. The command's build/entrypoint was verified; the agent did not launch native input/camera.
- Initial acquisition is included; timing starts at main dispatch and includes IPC/render scheduling, ending when main receives selection. Latency ends at move sent, before OS delivery. This is not hardware end-to-end latency or an ISO compliance study.
- Reports replace the previous saved session; copy them locally yourself before comparing runs. Failed saves may leave a subset of owned files; Delete clears those. Force-quitting can still interrupt filesystem writes.
- The baseline product remains unspecified under Q9. Real benchmark cases and matched input/scaling conditions are for the team to choose. Logs never export automatically.
- docs remains gitignored by the maintainer's choice; include the documentation changes deliberately in the human commit.

Manual checks for the human
1. Run pnpm bench:pointing (restart an older Gestura build once after this update). Back to settings: calibrate/start tracking, enable pointer control and choose blink/dwell clicks; then reopen the benchmark. Physical-input baseline runs should leave Gestura cursor/click control off.
2. At 100% browser zoom, complete A at 16/24/32/48 px, then B's icons, menus, tabs, links and cells. Check hit/miss/false-click accounting, no expanded hitboxes, right-button recording, timeout and visible target labels. Repeat on macOS and Windows, recording device scale; do not pool Retina/Windows-scaled runs.
3. First run with saving off: verify no benchmark files appear. Enable Local saving on before a run; complete or End it, then inspect session.json, summary.json and summary.md at the absolute folder shown. Verify latency samples appear only with the live pipeline; otherwise N/A is expected.
4. Exercise hotkey and corner pause in each mode: trial clock/clicks/latency stop during pause, camera remains local for head resume as in P2.4. Resize/change display/leave the window and verify partial session handling. Test closing control/quitting while an opted-in report is being written.
5. Delete local results and verify all three owned files disappear while unrelated files stay. Start a new session and confirm saving defaults off after relaunch. Launch pnpm bench:pointing while Gestura is running/minimized: the existing control should open, with no second cursor pipeline.

Open-question defaults used
- Q8: local-only, explicitly opt-in, user-deletable logs; no automatic export.
- Q9: 16/24/32/48 px, team-selected real cases and baseline product still unspecified.
- Q6: existing primary-display-only cursor and DPI-aware pipeline retained.

Changed files
- [AGENTS.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/AGENTS.md>)
- [apps/desktop/electron.vite.config.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/electron.vite.config.ts>)
- [apps/desktop/package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/package.json>)
- [apps/desktop/src/main/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/index.ts>)
- [apps/desktop/src/main/pointer/controller.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/pointer/controller.test.ts>)
- [apps/desktop/src/main/pointer/controller.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/pointer/controller.ts>)
- [apps/desktop/src/main/pointing-bench/controller.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/pointing-bench/controller.test.ts>)
- [apps/desktop/src/main/pointing-bench/controller.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/pointing-bench/controller.ts>)
- [apps/desktop/src/main/pointing-bench/store.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/pointing-bench/store.ts>)
- [apps/desktop/src/main/vision/ipc-policy.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/ipc-policy.ts>)
- [apps/desktop/src/main/vision/policy.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/main/vision/policy.test.ts>)
- [apps/desktop/src/renderer/control/CalibrationWizard.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/control/CalibrationWizard.tsx>)
- [apps/desktop/src/renderer/control/PointingBench.tsx](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/control/PointingBench.tsx>)
- [apps/desktop/src/renderer/shared/styles.css](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/apps/desktop/src/renderer/shared/styles.css>)
- [docs/PROGRESS.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/PROGRESS.md>)
- [docs/decisions/0008-pointing-benchmark.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/decisions/0008-pointing-benchmark.md>)
- [docs/p2.5-ui-checks.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/docs/p2.5-ui-checks.md>)
- [package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/package.json>)
- [packages/core/src/config/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/config/index.ts>)
- [packages/core/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/index.ts>)
- [packages/core/src/pointing-bench.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/pointing-bench.test.ts>)
- [packages/core/src/pointing-bench.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/packages/core/src/pointing-bench.ts>)
- [pnpm-lock.yaml](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/pnpm-lock.yaml>)
- [tools/pointing-bench/README.md](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/pointing-bench/README.md>)
- [tools/pointing-bench/package.json](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/pointing-bench/package.json>)
- [tools/pointing-bench/src/bench.test.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/pointing-bench/src/bench.test.ts>)
- [tools/pointing-bench/src/index.ts](</Users/seandarrentimothy/Documents/Hackathon/SDGS GenAI 2026/gestura/tools/pointing-bench/src/index.ts>)

Suggested commit message: `feat(P2.5): add local pointing benchmark and opt-in reports`
Changes left uncommitted for the human.

## P2.5 fix — Restore styles under development CSP — 2026-10-15

Status: fixed and verified in development/production renderers; native Electron manual check pending
Platforms checked: macOS TypeScript/tests/build/browser; Windows runtime pending

What changed
- Fixed the user's unstyled-control screenshot: Vite injected CSS without a CSP nonce, so the strict stylesheet policy blocked it. Earlier production-only UI verification missed the development path.
- Added a development-only Vite plugin using html.cspNonce and a fresh 24-byte nonce per complete HTML response. Matching nonce sources authorize Vite styles and React refresh scripts without unsafe-inline or general unsafe-eval. Production source policies and external CSS behavior remain unchanged; no Hard rules, Commands, application features, native code, external dependencies or workflows changed.
- Added integration tests using the actual Vite/React transform for control, overlay, vision and repeat requests, and included build tooling in desktop typecheck.

Measured checks
- pnpm verify: lint/typecheck passed, 48 test files / 182 tests passed.
- Electron production build and git diff --check passed. Existing upstream Zod comment annotation warnings remain.
- Actual development renderer with synthetic local bridge: computed system-ui/sans-serif, rgb(244,246,243) background, 52 px buttons and exact 16×16 px standard target. Styles remained after hot update; tracking settings were also styled. Zero captured warning/error console entries.
- Production renderer separately checked: same system font/background/52 px controls, zero warning/error console entries, no development nonce placeholders or unsafe-inline in built HTML.
- UI check report updated in docs/p2.5-ui-checks.md; evidence /private/tmp/gestura-csp-dev-fixed.png. No camera, microphone or native injection was used.

Manual checks
1. Stop the running pnpm dev process with Ctrl+C, then restart pnpm dev. Vite configuration changes need a full restart.
2. Check tracking settings and both benchmark modes: system font, green controls, visible bounded target area and correct target sizes. Keep zoom at 100%.
3. Recheck on Windows. The agent checked renderer behavior rather than launching the full native Electron/camera pipeline.

Changed files
- apps/desktop/build/dev-csp.ts
- apps/desktop/build/dev-csp.test.ts
- apps/desktop/electron.vite.config.ts
- apps/desktop/tsconfig.node.json
- docs/PROGRESS.md
- docs/p2.5-ui-checks.md

Suggested commit message: fix(P2.5): authorize Vite styles with per-response CSP nonces
Changes left uncommitted. docs remains gitignored; include it deliberately in the human commit.

## P2.6: Target snapping (2026-10-15)

Status: implemented; automated checks passed; native macOS/Windows validation pending.

What changed
- Added pure candidate scoring using target size, distance, optional gaze and configurable role priors. Default radius is 60 physical screen pixels; disabled, offscreen, non-clickable and oversized (>300 px on either axis) candidates are excluded.
- Added continuous 100 ms challenger hysteresis with a score margin. The cursor remains free; only gesture clicks use a selected target's center. Blink onset freeze, drag behavior and pause remain intact. The overlay highlights the selected target without accepting pointer events.
- Added non-overlapping background UI queries, synchronous cache-only selection/click reads, stale-result rejection, foreground/window invalidation and primary-display coordinate conversion. Click dispatch rechecks cached eligibility and target identity.
- Added per-app settings, off by default, with schema-validated preferences in userData/snap-preferences.json. Only explicit app-ID preferences are persisted; target names and window titles are not saved. Save failures remain visible until a successful retry.
- Bundled poor-coverage policy from ADR 0003 at build time. Explicit poor ratings override preferences. The real coverage table remains empty; no ratings were invented. Rebuild/restart after editing ratings.
- Added ADR 0009 and UI evidence. No dependencies, workflows, native code, root commands or AGENTS.md Hard rules changed.

Measured checks
- pnpm verify: lint/typecheck passed; 54 test files and 202 tests passed.
- Electron production build passed; existing upstream Zod annotation warnings remain. git diff --check passed.
- Existing synthetic hold-still landmark fixture: 120 selections after warmup, zero switches between adjacent buttons, deterministic repeat. This does not establish real-user accuracy.
- Scripted development settings: on/off/on exercised through the real controller; poor fixture disabled with a reason. Controls measured at least 52 px high. At 375x812, no horizontal overflow; buttons 312x52 px.
- Production overlay: physical 160x64 target at scale 2 rendered 80x32 CSS px, pointer-events none; pause cleared the outline. No captured renderer warnings/errors. No real camera, AX/UIA enumeration or input injection was used in UI checks.
- Full UI gate and screenshots: docs/p2.6-ui-checks.md; /private/tmp/gestura-p26-settings.png, /private/tmp/gestura-p26-overlay.png, /private/tmp/gestura-p26-mobile.png.

Known issues and defaults
- Q6 primary-display behavior retained. Snapping is explicitly off until enabled for an observed app. Gaze remains optional and follows existing calibration settings.
- Foreground identity is polled asynchronously: a brief change-between-polls race remains. Old/slow/unavailable queries fall back to the raw click position; real provider timing and accuracy remain unmeasured.
- Synthetic jitter tests do not replace consented user fixtures. Native alignment, permissions, pause responsiveness and real-world selection accuracy require both OS checks.
- The pointing benchmark does not yet record snap condition; note the enabled app/preferences manually when comparing runs.
- docs remains gitignored by the human's existing choice. Include these docs deliberately when committing, especially ADR 0003: the build now requires that source file. Ignore rules were not changed.

Manual checks
1. Restart pnpm dev, calibrate, start tracking and enable pointer control plus blink or dwell clicks. Bring Finder (or a Windows app) forward, then return to settings and enable snapping for its observed exact app ID.
2. Return to that app. Check free cursor motion, stable target outline, centered left click and left-wink right click. Try adjacent buttons, large panes and controls near screen edges. Compare snapping on/off with the same benchmark conditions.
3. Check Retina and Windows DPI alignment using pnpm native:ui-probe. Verify unavailable Accessibility/UIA data falls back to ordinary clicks; test app/window/display changes and a slow query provider.
4. Test global hotkey and corner pause, resume and drag mode. No movement or clicks should be sent while paused; drag should retain its previous behavior.
5. Relaunch to check explicit per-app preference persistence. Add a poor rating only after measuring an actual app, rebuild, and verify it forces snapping off. Repeat native checks on Windows 11.

Changed files (P2.6 manifest)
- apps/desktop/build/ui-coverage.ts
- apps/desktop/build/ui-coverage.test.ts
- apps/desktop/electron.vite.config.ts
- apps/desktop/src/main/config.test.ts
- apps/desktop/src/main/gestures/overlay.ts
- apps/desktop/src/main/index.ts
- apps/desktop/src/main/pointer/controller.ts
- apps/desktop/src/main/pointer/controller.test.ts
- apps/desktop/src/main/snapping/controller.ts
- apps/desktop/src/main/snapping/controller.test.ts
- apps/desktop/src/main/snapping/coverage.d.ts
- apps/desktop/src/main/snapping/store.ts
- apps/desktop/src/main/snapping/store.test.ts
- apps/desktop/src/main/vision/ipc-policy.ts
- apps/desktop/src/main/vision/policy.test.ts
- apps/desktop/src/renderer/control/CalibrationWizard.tsx
- apps/desktop/src/renderer/control/SnapSettings.tsx
- apps/desktop/src/renderer/overlay/GestureOverlay.tsx
- apps/desktop/src/renderer/shared/styles.css
- packages/core/src/config/index.ts
- packages/core/src/config/index.test.ts
- packages/core/src/gestures.ts
- packages/core/src/index.ts
- packages/core/src/snap.ts
- packages/core/src/snap.test.ts
- packages/pointer/src/index.ts
- packages/pointer/src/snap.ts
- packages/pointer/src/snap.test.ts
- tools/replay/src/snap-fixtures.test.ts
- docs/PROGRESS.md
- docs/decisions/0003-ui-element-coverage.md
- docs/decisions/0009-click-time-target-snapping.md
- docs/p2.6-ui-checks.md

Suggested commit message: feat(P2.6): add cached click-time target snapping

Changes left uncommitted for human review, commit and push.

## P3.1: On-device ASR (2026-10-15)

Status: implemented and checked on macOS arm64 with local WAVs; actual microphone, Intel macOS and Windows runtime checks pending. No consented team recordings available (confirmed by maintainer).

What changed
- models:fetch now verifies and bundles the newest CPU SenseVoice int8 release export, sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17, and Silero VAD. Archive, installed model/token/VAD files and five upstream WAVs have pinned SHA-256 checksums. Verified local cache works without downloads. Model build copies are ignored; no model download occurs at runtime.
- Added an on-demand hidden, sandboxed capture renderer with audio-only permission. AudioWorklet mixes to mono and low-pass resamples to 16 kHz Float32, emits bounded 512-sample packets with sequence numbers/capture timestamps, and transfers them directly to the speech utility over a main-created MessagePort. Main never receives PCM payloads.
- Added a sherpa-onnx-node utility using Silero VAD and asynchronous SenseVoice with inverse text normalization on. Shared schemas validate packets, acknowledgements, status and Transcript {text, lang, tSpeechStart, tSpeechEnd, tDone}. Local OpenCC cn-to-hk conversion follows Q12's Traditional Hong Kong default and preserves Cantonese wording.
- Stop, pause, control-window close and failures destroy capture and stop the utility; pending permission requests cannot revive cancelled capture. No automatic listening restart. VAD activity feeds existing speech suppression; mouth events cannot confirm ActionGate proposals. Local speech controls support dwell/keyboard; overlay has a static, click-through microphone-live label. Transcript preview is memory-only and clears on stop; no dictation insertion or voice-command execution yet.
- Added bench:voice for paced WAV evaluation, fixture parsing/checksum tests, capture cancellation/resampling tests, lifecycle/permissions/IPC tests and script conversion tests. Updated the Commands table only; no Hard rules or workflows edited. New dependencies: sherpa-onnx-node 1.13.8 (local native ASR/VAD; published arm64/Intel macOS and Windows x64 packages) and opencc-js 1.4.2 (bundled, platform-independent conversion dictionaries).

Human-authorized exception
- The maintainer explicitly approved direct in-memory capture-renderer-to-speech-utility audio transfer after the Hard rule 3 conflict was raised. Authorization is recorded in ADR 0004; main/disk/network remain excluded. The agent did not edit the Hard rules section. The human should reconcile that section with their authorized architecture when maintaining AGENTS.md.

Measured checks
- pnpm models:fetch: local face/WASM and speech assets all verified and bundled. SenseVoice archive SHA-256 257936ea9a64cbe33200274e6367fc26d373ff6ca58b996b15108ffd6b9f6148; Silero SHA-256 9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6. Full pins/source selection: docs/decisions/0004-asr-model.md.
- pnpm verify: lint/typecheck passed; 62 test files passed, one heavy suite skipped; 219 tests passed, six real-model cases gated behind bench:voice.
- pnpm bench:voice: five upstream WAV tests passed; one team case skipped because its consent manifest is empty. Real-time 16 kHz WAV pacing through production VAD/ASR, five detected segments. Final run p50 624 ms and p95 646 ms from detected speech end to normalized transcript; earlier run 626/747 ms. These small-sample results are not microphone/accuracy/Windows measurements.

| Fixture | Segments | Speech-end latency p50 | p95 |
| --- | ---: | ---: | ---: |
| en.wav | 1 | 631 ms | 631 ms |
| zh.wav | 1 | 624 ms | 624 ms |
| yue.wav | 1 | 582 ms | 582 ms |
| ja.wav | 1 | 646 ms | 646 ms |
| ko.wav | 1 | 605 ms | 605 ms |
| Pooled | 5 | 624 ms | 646 ms |

- Production Electron build passed. A windowless Electron utility consumed the upstream Cantonese WAV over MessageChannelMain and returned “呢幾個字都表達唔到我想講嘅意思”. The smoke test caught a CommonJS named-import incompatibility missed by Node/Vitest; corrected to the package default export and rerun successfully.
- Real browser AudioCapture/AudioWorklet with synthetic oscillator MediaStream (no microphone): 32 packets of 512 samples; seq 0..31; first-to-last timestamp span 992 ms; RMS about 0.1416; capture stopped cleanly. Strict CSP retained, no unsafe-eval added.
- Scripted settings UI: mouse and Enter start/stop, clear-on-stop, pause-off and disabled start while paused checked. Buttons 52 px high; no overflow at 375x812. Overlay mic label is static, pointer-events none; pause removes it. UI gate/evidence in docs/p3.1-ui-checks.md. No real camera/microphone/native injection was used by UI tests.
- git diff --check passed. Existing upstream Zod annotation warnings remain in build output.

Known limitations
- The newest model returns empty native language metadata for these five samples. Transcript.lang is honestly unknown; no heuristic substitutes Mandarin for Cantonese. Language-ID improvements need a later decision/upstream fix. Recognition text and timing still work.
- Speech-end timestamps are VAD boundaries, not human-labelled ground truth. No Cantonese/English/code-mixed accuracy rate or live-microphone latency claim is made.
- Team recordings were not supplied. fixtures/audio/team/manifest.json stays empty; instructions require existing consented mono 16 kHz WAVs. No recording feature was added. Windows and Intel macOS native/runtime verification remain human checks despite published compatible addon binaries.
- Packaging must include resources/speech and the platform sherpa addon/libraries. This step verifies Electron build/dev, not a distributable installer/signing flow. docs remains gitignored under the human's existing choice; include the progress/ADR/UI report deliberately in the human commit.

Manual checks
1. Run pnpm install, pnpm models:fetch, then restart pnpm dev. In Local speech, use Start listening by dwell or keyboard. Grant microphone permission to Gestura/Electron if prompted. Verify the OS mic indicator and overlay “Microphone live” appear together; no camera starts from this action.
2. Say Cantonese, English and mixed phrases, including numbers and symbols. Confirm preview text uses Traditional Hong Kong characters and preserves spoken Cantonese. The current model may show Language not reported. Verify nothing is inserted into another app and no commands execute.
3. Stop listening: verify the OS microphone indicator and overlay label disappear and preview clears. Test permission denial, device unplug, starting then immediately stopping during the permission prompt, repeated start/stop, control-window close and quit. Retry must work after resolving permission/model errors.
4. While listening, pause using Ctrl+Option+P (macOS), Ctrl+Alt+P (Windows) and the corner dwell control. Audio and input must stop. Resume must leave listening off until explicit Start. Verify no held-mouth listening event fires while talking; gaze/dwell can reach the listening control without speech.
5. Run pnpm bench:voice on macOS Intel and Windows 11 as well as the lead Apple Silicon machine. Record hardware and VAD-end p50/p95 separately. Add team WAVs only after consent, then rerun; do not claim their coverage while the manifest is empty.
6. Inspect app userData/log directories: no raw audio/WAVs or persisted transcripts should appear. Disconnect the network after models are fetched and confirm capture/transcription/conversion still work. Installer resource/addon inclusion remains a later packaging check.

Changed files (P3.1 manifest)
- .gitignore; AGENTS.md (Commands table only); eslint.config.mjs; package.json; pnpm-lock.yaml
- scripts/fetch-models.mjs; scripts/speech-assets.mjs; scripts/speech-assets.d.mts; scripts/voice-bench.mjs
- packages/core/src/speech.ts; packages/core/src/speech.test.ts; packages/core/src/index.ts; packages/core/src/config/index.ts; packages/core/src/config/index.test.ts
- apps/desktop/package.json; apps/desktop/electron.vite.config.ts; apps/desktop/tsconfig.node.json; apps/desktop/build/dev-csp.test.ts
- apps/desktop/src/main/index.ts; apps/desktop/src/main/config.test.ts; apps/desktop/src/main/pointer/controller.ts
- apps/desktop/src/main/vision/ipc-policy.ts; apps/desktop/src/main/vision/policy.test.ts
- apps/desktop/src/main/speech/controller.ts; controller.test.ts; permissions.ts; permissions.test.ts; transport.ts
- apps/desktop/src/preload/index.ts; apps/desktop/src/shared/schema-runtime.ts
- apps/desktop/src/renderer/speech/index.html; main.ts; capture.ts; capture.test.ts; resampler.ts; resampler.test.ts; worklet.ts
- apps/desktop/src/renderer/control/SpeechSettings.tsx; CalibrationWizard.tsx; DebugPanel.tsx
- apps/desktop/src/renderer/overlay/GestureOverlay.tsx; apps/desktop/src/renderer/shared/styles.css
- apps/desktop/src/utility/speech/index.ts; engine.ts; normalize.ts; normalize.test.ts; sherpa.d.ts
- tools/voice-bench/package.json; tools/voice-bench/tsconfig.json; tools/voice-bench/src/asr.test.ts; assets.test.ts; wav.ts; wav.test.ts
- fixtures/audio/README.md; fixtures/audio/team/manifest.json; fixtures/audio/sherpa/en.wav; zh.wav; yue.wav; ja.wav; ko.wav
- docs/PROGRESS.md; docs/decisions/0004-asr-model.md; docs/p3.1-ui-checks.md

Suggested commit message: feat(P3.1): add local SenseVoice ASR and microphone lifecycle

Changes left uncommitted for human review, commit and push.

## P3.2: Intents (2026-10-15)

Status: implemented and verified locally on macOS; Windows teammate verification and consented command audio remain pending. Runtime command dispatch/palette UI belongs to P3.3.

What changed
- Added packages/intent/commands.yaml: 17 intents, typed slots and 125 English/Traditional colloquial Cantonese/mixed phrasings. A validated generation command produces checked-in JSON; CI tests detect stale data and invalid definitions. Runtime intent code imports data and pure OpenCC conversion only, without Electron/DOM/filesystem/network imports.
- Added width/case/punctuation/script normalization, English/Chinese spoken numbers (including 廿/卅/卌), letter aliases and bounded Excel cell/range parsing. Literal BEE2 remains BEE2; spaced spoken “bee two” resolves to B2. No invalid cell value is fuzzy-repaired.
- Added exact templates, conservative edit-similarity scoring (default 0.86, margin 0.08), ambiguity handling and up to three structured suggestions. Low-confidence Excel input returns a GenAI route value with original request text. Explicit formula slots preserve case, punctuation, characters and symbols. This step makes no provider call or native input action.
- Confirm/cancel require a pending proposal and exact matching. They are excluded from fuzzy candidates and gaze suggestions. Voice confirmation emits the validated original tSpeechStart. ActionGate.markShown records trusted presentation time; confirm rejects missing/unshown, pre-display/equal-display, invalid and future onset. Proposal expiry and ConfirmedAction.confirmedAt remain monotonic for NativeBridge. Brand/hash/expiry/single-use and blink/wink/dwell rejection remain intact.
- Added CSV benchmark with validated intent/JSON slots and optional audio/context/pending columns. Default text mode works without speech models/addons; audio mode runs local P3.1 VAD/ASR before matching. Reports distinguish intent from intent-plus-slot accuracy overall and by supplied language label. Errors count as wrong, missing audio is skipped explicitly, no coverage is N/A. stdout only; --json provides structured output.
- Preserved the P3.1 latency suite as pnpm bench:voice:asr. Updated AGENTS.md Commands only; no Hard rules, workflow, UI, IPC endpoints or microphone capture behavior changed. New dev tooling: yaml 2.9.1, csv-parse 6.2.1, tsx 4.23.15; pure intent explicitly reuses OpenCC JS 1.4.2. Node/pnpm entry points avoid shell-specific environment assignments.

Measured checks
- pnpm verify: lint/typecheck passed; 70 test files / 286 tests passed; one heavyweight suite (six cases) intentionally gated behind bench:voice:asr.
- Every one of the 125 authored phrasings matched its intended ID, with valid representative slots. Generated YAML/JSON equality passed. Additional tests cover malformed CSV/slots, actual CLI JSON/error exits, fuzzy ambiguity, cell bounds, symbols, spoken references, confirmation onset and unchanged native bridge behavior.
- pnpm bench:voice synthetic text results:

| Group | Cases | Intent accuracy | Intent + slots |
| --- | ---: | ---: | ---: |
| English | 20 | 100% | 100% |
| Cantonese | 20 | 100% | 100% |
| Mixed | 20 | 100% | 100% |
| Overall | 60 | 100% | 100% |

- The text set is hand-authored, synthetic and overlaps catalogue examples: these numbers are regression coverage, not held-out speech/user accuracy. Normal pnpm verify evaluates this CSV and enforces >=90% exact accuracy per group.
- Real-ASR audio mode correctly returned suggestions for the one upstream Cantonese non-command fixture. Coverage: yue 1/1; English/mixed N/A. This is a rejection smoke test, not voice-command accuracy. No team command recordings exist yet, per the maintainer's P3.1 reply.
- pnpm bench:voice:asr retained all five upstream WAV passes and one empty-team-manifest skip. This run measured VAD-end latency p50 615 ms/p95 642 ms across five segments; not a microphone or intent-accuracy measurement.
- Production Electron build passed; existing upstream Zod annotation warnings remain. git diff --check passed. No camera, microphone, OS input injection or external GenAI calls were used.
- Decision and integration contract: docs/decisions/0010-intent-matching.md. CLI and CSV guides live in tools/voice-bench/README.md and fixtures/transcripts/README.md.

Defaults and limitations
- Q4 voice/held-mouth confirmation and Q12 Traditional Hong Kong output retained. Chinese folding is solely for matching; dictated/generated payloads are not rewritten by the matcher. Q11 dictation still requires ActionGate confirmation when insertion is implemented.
- Fuzzy confidence is a similarity score, not a calibrated probability. The input bound is 2,000 characters by default, configurable in core. Unlisted/ambiguous pronunciations can yield suggestions; no real-world recognition rate is claimed.
- A future trusted presentation path must call markShown only after showing the actual proposal. Only a trusted speech transcript may supply confirmation onset; renderer choices, CSV synthetic times and gaze clicks must never become voice evidence. This step adds no active proposal UI or confirmation IPC endpoint.
- GenAI routing is a typed result, not provider integration. Live voice dispatch, phrase palette selection UI, dictation, undo and Excel navigation execution remain P3.3/later work. Windows execution still needs a teammate run; no Windows pass is claimed from macOS checks.
- docs remains gitignored under the existing human preference. Include this entry and ADR deliberately when committing. Changes remain uncommitted.

Manual checks
1. On macOS and Windows 11, run pnpm install, pnpm verify and pnpm bench:voice from the repository root. Expect 60 evaluated synthetic cases and the four language/overall table rows. Add new team text cases as independent coverage; review the colloquial Cantonese phrases with a Cantonese speaker.
2. Run pnpm bench:voice --json and check it parses as JSON. Custom CSV paths resolve from the repo root; quoted JSON slots, Unicode/BOM and mixed text are supported. Try a wrong expected range and verify intent accuracy differs from exact accuracy. Bad files/columns/options should fail visibly.
3. After pnpm models:fetch, run pnpm bench:voice --mode audio --csv fixtures/transcripts/p3.2-audio-smoke.csv. Expect the Cantonese non-command rejection only and N/A for groups without audio. Missing model/WAV errors must count as wrong, not skipped successes. Rows with no audio must show skipped coverage.
4. Run pnpm bench:voice:asr to retain P3.1 latency checks. Add actual command recordings only after consent and a team-manifest entry; then compare text vs audio results by known language group. Do not claim command-audio accuracy from the non-command sample.
5. Review commands.yaml, edit phrasings as needed, run pnpm intents:generate, then pnpm verify. Editing YAML without regeneration should fail the sync test. In the current app, speech remains a preview; live voice command execution arrives in P3.3.
6. When the proposal UI is implemented, wire markShown after presentation and use trusted ASR onset. Repeat the supplied pre-display/equal-display/future-start tests at that UI boundary; held-mouth remains the non-speech confirmation path, never blink/wink/dwell.

Changed files (P3.2 manifest)
- AGENTS.md (Commands only)
- package.json
- pnpm-lock.yaml
- packages/core/src/index.ts
- packages/core/src/config/index.ts
- packages/core/src/config/index.test.ts
- packages/core/src/intent.ts
- packages/core/src/intent.test.ts
- packages/core/src/voice-bench.ts
- packages/core/src/voice-bench.test.ts
- packages/intent/package.json
- packages/intent/README.md
- packages/intent/commands.yaml
- packages/intent/src/commands.generated.json
- packages/intent/src/index.ts
- packages/intent/src/index.test.ts
- packages/intent/src/matcher.ts
- packages/intent/src/matcher.test.ts
- packages/intent/src/normalize.ts
- packages/intent/src/normalize.test.ts
- packages/intent/src/types.ts
- apps/desktop/src/main/action-gate/index.ts
- apps/desktop/src/main/action-gate/index.test.ts
- apps/desktop/src/main/config.test.ts
- apps/desktop/src/main/native/index.test.ts
- tools/voice-bench/package.json
- tools/voice-bench/README.md
- tools/voice-bench/src/index.ts
- tools/voice-bench/src/asr.ts
- tools/voice-bench/src/asr.test.ts
- tools/voice-bench/src/catalogue.ts
- tools/voice-bench/src/catalogue.test.ts
- tools/voice-bench/src/generate.ts
- tools/voice-bench/src/csv.ts
- tools/voice-bench/src/evaluate.ts
- tools/voice-bench/src/evaluate.test.ts
- tools/voice-bench/src/cli.ts
- tools/voice-bench/src/cli.test.ts
- tools/voice-bench/src/confirmation.test.ts
- fixtures/transcripts/README.md
- fixtures/transcripts/p3.2-commands.csv
- fixtures/transcripts/p3.2-audio-smoke.csv
- fixtures/audio/README.md
- docs/PROGRESS.md
- docs/decisions/0010-intent-matching.md

Suggested commit message: feat(P3.2): add multilingual intents and CSV voice benchmarks

Changes left uncommitted for human review, commit and push.

## P3.3 — Dictation and gaze-only parity (2026-10-16)

Implemented
- Added the main InputController and validated palette config/state/control schemas. Voice and non-voice commands share dispatch; the coverage test lists any catalogue intent missing a registered non-voice action.
- Listening supports the guarded P2.4 toggleListening path, a fixed overlay dwell tile and Control+Alt+L (Ctrl+Option+L on macOS). Global pause remains Control+Alt+P. Microphone startup requires a ready, visible overlay. Gaze-only immediately stops capture, invalidates pending capture generations, blocks all restart paths and does not automatically restart when turned off.
- Dictation-on sends final transcripts to ActionGate.propose with kind dictation. Continued speech appends to a replacement proposal, revoking the old ID and clearing presentation/confirmation state. NativeBridge types only an exact, minted, matching, single-use confirmation. Text, clipboard contents and transcripts stay in memory.
- Q4/Q10/Q11/Q12 retained: fresh post-presentation spoken confirmation or a one-second fresh mouth hold with a visible numerical countdown. Blink/wink/dwell never confirm. Pending proposals consume mouth holds for confirmation rather than toggling the mic. Mic-off holds require visual closure/stability; live-mic holds require VAD silence.
- Added paged review text, proposal cancellation/expiry, destination app/window recheck, display-change invalidation and overlay-loss pause. Pause aborts chunked native typing; partial insertion is reported without creating an undo record.
- Added >=64px phrase, key, editing and Excel starter tiles, paged character composition and phrase add/edit/remove. Overlay stays click-through and unfocusable; main consumes palette selections before native clicks. Snap ignores palette regions. A control-window mirror supports keyboard access, Unicode draft editing and Escape close. Palette drag-on arms the next target; fixed dwell makes drag-off reachable while the button is held.
- Clipboard paste snapshots plain text into a reviewed proposal, never an immediate paste shortcut. Undo-that is a guarded, single-use primary+Z within 15 seconds of the last completed insertion in the same app/window, invalidated by subsequent Gestura input.
- Explicit phrase/settings edits persist to userData/palette.json; drafts are not persisted. No telemetry or new third-party dependency. Desktop now links and bundles the existing workspace intent package. No workflow changes and no Hard rules edits.
- Ten Excel starters use Microsoft's current featured list, not a measured usage ranking. Range/formula composers report the pending P4.1/P4.2 integrations without fake execution. See decisions/0011-dictation-and-gaze-parity.md.

Verification and measurements
- pnpm verify: lint and all workspace typechecks pass; 75 test files passed, 1 optional ASR suite skipped; 307 tests passed, 6 skipped. The six existing opt-in ASR/team cases were not enabled for this step.
- Electron production build passes. Existing upstream Zod PURE-comment warnings remain non-fatal.
- Replay: the labelled P2.4 synthetic blink/wink/reading/talking fixture emitted zero 800ms listening holds and zero 1000ms confirmation holds. This is synthetic coverage, not a human false-trigger rate or an ASR latency measurement.
- Browser check with actual React/CSS/controller and fake native input: desktop 1280x720 and narrow 320x640. No horizontal overflow; narrow palette tiles measured 93x64 and dock tiles 66x64. Keyboard activation exercised opening/paging, composing/saving a phrase and presenting bilingual text. Final fresh preview tab had no console errors. No live camera/microphone or real destination input was used.
- UI delivery gate: PASS with evidence in p3.3-ui-checks.md. Existing light green/system-font direction retained; ENERGY 1 / RHYTHM 1 / MOTION 1.

Limits and follow-ups
- Native undo grouping is app-dependent. App ID/window-title checks do not detect physical edits or a caret change within the same window. Do not use undo-that after unrelated physical edits. Exact editor transactions require future integration support; no real-editor undo success is claimed.
- A physical focus change during an already-running native text call cannot be made transactional by these APIs. Confirm only in the intended destination; pause immediately if focus changes. Gestura-generated clicks are suppressed during insertion.
- The character composer supplies Latin letters, numbers and punctuation plus reusable configured phrases; the Unicode control field supports Chinese phrase editing. No new on-screen Cantonese IME is included.
- Real-user talking/sustained-vowel rejection, microphone/Accessibility permissions, global shortcuts, native focus/undo behavior and Windows runtime checks remain manual. No consented team recordings exist yet. No new ASR or end-to-end hardware latency claim is made.
- docs remains gitignored by the human's existing preference. Include these documentation files deliberately when committing. All code changes remain uncommitted.

Manual checks on macOS and Windows 11
1. Run pnpm dev after the existing models/native setup. Start tracking, calibrate and enable pointer control. Grant camera/Accessibility permission as required. Test both blink and dwell modes. Open the Palette tile; selecting tiles must not also click the app underneath. Pause and corner-dwell resume must still work.
2. Focus an empty disposable editor document. Start listening with Ctrl+Option+L / Ctrl+Alt+L, the Listen tile or a fresh closed-then-held jaw gesture. Confirm the overlay's Mic live indicator and stop listening through each path. Denied permission/model failure must fail closed. Hiding/reloading the overlay during listening must pause and stop the mic.
3. Say dictation on, then Hello 你好 and a second segment. Verify a growing proposal and no destination text yet. Say confirm only after the latest card is shown, or close then hold the mouth open for one second with the displayed countdown. Verify a single insertion. Blinks/winks/dwell on the card must never insert it. Try Cancel and a 60-second expiry.
4. Enable gaze-only. Confirm microphone capture stops, including if enabled during model loading/permission startup. Listen, jaw-toggle and hotkey must not restart it. Use only head/dwell/blink to page, compose text, add/edit/remove a phrase, choose keys, stage paste and insert an Excel starter through mouth confirmation. Go-to/formula requests must clearly report their unavailable integration.
5. Change focus before confirmation and confirm nothing is inserted. Pause during a long insertion; check the partial-insertion notice and that typing stops. Try immediate undo-that in each supported editor with no intervening input, then after another action, a window change and 15 seconds. Check actual undo grouping; do not assume universal editor behavior.
6. Repeat deliberate mouth holds and ordinary reading/talking, including sustained vowels, with the mic on and off. Record unexpected toggles/confirmations before making real-user reliability claims. Confirm pause remains usable while dragging and the dwell palette can release drag.
7. Resize/change display scaling, check primary-display geometry and the restored overlay bounds, confirm proposals are cancelled, and repeat all checks with the Windows teammate. Check keyboard focus and Escape using the control-window palette mirror.

Changed files (P3.3 manifest)
- apps/desktop/package.json
- apps/desktop/electron.vite.config.ts
- apps/desktop/src/main/index.ts
- apps/desktop/src/main/action-gate/index.ts
- apps/desktop/src/main/config.test.ts
- apps/desktop/src/main/input/controller.ts
- apps/desktop/src/main/input/controller.test.ts
- apps/desktop/src/main/input/store.ts
- apps/desktop/src/main/input/store.test.ts
- apps/desktop/src/main/native/index.ts
- apps/desktop/src/main/native/index.test.ts
- apps/desktop/src/main/pointer/controller.ts
- apps/desktop/src/main/pointer/controller.test.ts
- apps/desktop/src/main/speech/controller.ts
- apps/desktop/src/main/speech/controller.test.ts
- apps/desktop/src/main/vision/ipc-policy.ts
- apps/desktop/src/renderer/control/SpeechSettings.tsx
- apps/desktop/src/renderer/overlay/GestureOverlay.tsx
- apps/desktop/src/renderer/overlay/PhrasePalette.tsx
- apps/desktop/src/renderer/shared/styles.css
- packages/core/src/index.ts
- packages/core/src/palette.ts
- packages/core/src/palette.test.ts
- packages/core/src/config/index.ts
- packages/core/src/config/index.test.ts
- packages/gestures/src/index.ts
- packages/gestures/src/mouth-hold.ts
- packages/gestures/src/mouth-hold.test.ts
- tools/replay/src/mouth-fixtures.test.ts
- pnpm-lock.yaml
- docs/PROGRESS.md
- docs/decisions/0011-dictation-and-gaze-parity.md
- docs/p3.3-ui-checks.md

Suggested commit message: feat(P3.3): add confirmed dictation and gaze-only phrase palette

Changes left uncommitted for human review, commit and push.


## P4.1 — Excel bridge spike (2026-10-16)

Status: implemented and verified on macOS (unit/integration/build); live Office host and Windows WebView2 checks pending.

What changed
- Added shared zod schemas in packages/core/src/excel.ts for context, samples, commands and events, plus ExcelConfigSchema (`enabled` default false, `port` 3510, `shareSampleValues` default false) in packages/core/src/config/index.ts.
- Added a main-process loopback HTTPS+WebSocket bridge (apps/desktop/src/main/excel-bridge): token-paired WSS upgrade (constant-time compare), self-signed localhost cert persisted to userData/excel-dev-cert, HTML served with the pairing token injected server-side at a placeholder, validated event routing, and an ExcelBridge whose writeFormula accepts only a fresh, single-use ActionGate ConfirmedAction.
- Scaffolded a minimal task-pane Office.js add-in (integrations/excel-addin) with manifest.xml, esbuild build, a pure context builder (header detection, column-type inference, 5-value sample cap) and a BridgeClient that validates inbound commands and auto-reconnects with capped backoff.
- selectRange only highlights (range.select()); it never writes. writeFormula writes range.formulas to the target cell.

Measured checks
- pnpm lint and the three relevant workspace typechecks pass; 81 test files / 349 tests pass (6 skipped). excel-addin builds via esbuild.
- Automated tests cover: token-paired connect, getContext/writeFormula/selectRange dispatch, invalid-command rejection, reconnect backoff, server token rejection, and bridge writeFormula rejecting non-confirmed/reused confirmations.

Known issues / follow-ups
- No live Office host is available here: real Ctrl+Z undo of an add-in write, both webviews opening a WSS socket to 127.0.0.1 with a trusted self-signed cert, and Windows WebView2 all remain manual checks. Documented fallback if a platform rejects loopback TLS: serve the taskpane over plain http on loopback, keeping the token requirement.
- Header detection is text-shape heuristic; column types are coarse inference, not cell format metadata.

Manual checks for the human
- [ ] Trust the dev cert on macOS (Keychain) and Windows (cert store), then sideload the manifest and confirm the taskpane loads and shows "Connected to Gestura".
- [ ] Confirm both WebKit and WebView2 open the WSS socket; if one fails, try the plain-http fallback and record the result.
- [ ] In desktop Excel, run a confirmed writeFormula and press Ctrl+Z to verify it undoes the add-in write; confirm selectRange only changes selection and is not undoable.

Open-question defaults used
- Q15: sample values only behind a visible opt-in toggle, off by default (shareSampleValues).

Suggested commit message
feat(P4.1): add token-paired Excel add-in bridge

Changed files (P4.1 manifest)
- packages/core/src/excel.ts; packages/core/src/excel.test.ts; packages/core/src/index.ts
- packages/core/src/config/index.ts; packages/core/src/config/index.test.ts
- apps/desktop/package.json; apps/desktop/src/main/config.test.ts
- apps/desktop/src/main/excel-bridge/index.ts; server.ts; server.test.ts; bridge.ts; bridge.test.ts; cert.ts; token.ts; token.test.ts
- integrations/excel-addin/package.json; tsconfig.json; manifest.xml; build.mjs
- integrations/excel-addin/src/index.ts; index.test.ts; context.ts; context.test.ts
- integrations/excel-addin/src/taskpane/taskpane.html; taskpane.ts; office.ts; bridge-client.ts; bridge-client.test.ts
- docs/PROGRESS.md; docs/decisions/0012-excel-bridge.md
- pnpm-lock.yaml

Changes left uncommitted for human review, commit and push. docs remains gitignored under the human's existing preference; include it deliberately when committing.

## P4.2 — Formula generation pipeline (2026-10-17)

Status: implemented and verified on macOS (unit/integration/build); live LLM provider and Windows checks pending.

What changed
- Added genai config schemas (cloudProvider: optional apiKey/host/model; localProvider: Ollama host/model/enabled; formula: timeoutMs/maxRetries/maxHistory) with defaults to AppConfigSchema. GenAI requests go through the network allowlist (hard rule 4).
- Added packages/genai with a provider interface (GenerateRequest/GenerateResponse/Provider) and three implementations: CloudProvider (OpenAI-compatible, Bearer auth, structured JSON output), LocalProvider (Ollama /api/chat with format parameter), and MockProvider (canned responses keyed by utterance, configurable latency, throwOnUnknown).
- Added FormulaRequest/FormulaResponse zod schemas as discriminated unions (status: ok | needs_clarification | unsupported). FormulaRequest context is Q15-compliant: headers + addresses + types only; samples only behind shareSampleValues toggle.
- Added formula validator: syntax must start with =, unsafe function blocklist (WEBSERVICE, RTD, CALL, REGISTER.ID, SQL.REQUEST, DDEINITIATE, QUERYTABLE), reference bounds check against usedRange.
- Added FormulaRouter: cloud-first with 8s timeout → single-function local fallback (Ollama). Retries once on validation failure. Single-function detection uses regex heuristics.
- Integrated formula pipeline with InputController: go-to dispatches excelBridge.selectRange(); formula-request calls handleFormulaRequest() → buildFormulaContext → FormulaRouter.generate → ActionGate.propose → confirmation → excelBridge.writeFormula(confirmed). PalleteStateSchema pending.kind now supports 'formula'.
- Added pnpm bench:formula (tools/formula-bench) with CSV fixture parsing, MockProvider-based evaluation and markdown/json report output against fixtures/formula-cases/p4.2-baseline.csv.
- Wired FormulaRouter creation in apps/desktop/src/main/index.ts with config.genai values. CloudProvider/LocalProvider/FormulaRouter instantiated when cloudProvider is configured; passed as optional parameters to InputController.

Measured checks
- pnpm verify: lint, typecheck, and 81 test files / 387 tests pass (6 skipped).
- Electron production build succeeds.
- 8 formula-bench tests cover CSV parsing (valid/invalid/duplicate IDs), ok/unsupported evaluation, and unsafe-formula mismatch detection.

Known issues / follow-ups
- No live LLM provider (cloud or local Ollama) was tested. The benchmark validates the pipeline with MockProvider only; real formula accuracy remains unmeasured.
- The prompt template (formula.v1.md) with few-shot examples is not yet created as a separate file; a minimal inline prompt is used in FormulaRouter. The full prompt with 9 few-shot examples should be added as an inline TS constant.
- Network allowlist must include the cloud provider host before any live requests are made. localProvider.enabled is advisory; LocalProvider always attempst the configured host.
- Windows runtime checks pending.

Manual checks for the human
- [ ] Configure config.genai.cloudProvider in userData/config.json, add the host to network.allowlist, add @gestura/genai workspace dependency to the production allowlist entry, then launch with pnpm dev.
- [ ] With Excel bridge connected, activate compose:formula through the palette, speak a formula request, confirm, and verify the formula appears in Excel.
- [ ] Test compose:range and verify selectRange highlights the correct range.
- [ ] Test without genai configured: verify the unavailable-integration message appears.
- [ ] Test with a local Ollama instance running at 127.0.0.1:11434 for single-function fallback.
- [ ] Run pnpm bench:formula and verify all 9 baseline cases are evaluated.

Open-question defaults used
- Q14: provider-agnostic CloudProvider (OpenAI-compatible API); any provider with a /v1/chat/completions endpoint works.
- Q15: samples only when shareSampleValues toggle is on; context builder strips cell values otherwise.
- Q16: Ollama as local fallback, single-function requests only.

Suggested commit message
feat(P4.2): add formula generation pipeline with configurable providers

Changed files (P4.2 manifest)
- packages/core/src/config/index.ts; packages/core/src/config/index.test.ts
- packages/core/src/palette.ts
- packages/genai/package.json; packages/genai/tsconfig.json
- packages/genai/src/index.ts; packages/genai/src/index.test.ts
- packages/genai/src/providers/cloud.ts; local.ts; mock.ts
- packages/genai/src/formula/router.ts
- apps/desktop/package.json
- apps/desktop/src/main/index.ts
- apps/desktop/src/main/input/controller.ts; controller.test.ts
- tools/formula-bench/package.json
- tools/formula-bench/src/index.ts; index.test.ts; cli.ts; csv.ts; evaluate.ts
- fixtures/formula-cases/p4.2-baseline.csv
- package.json (root)
- docs/PROGRESS.md

Changes left uncommitted for human review, commit and push. docs remains gitignored under the human's existing preference; include it deliberately when committing.

## P4.3 — Formula proposal, confirmation and correction loop

Date: 2026-10-17.

Changed
- Added a dedicated formula state machine: thinking/clarification/proposal/correction/write/receipt/undo/error. Generation runs outside the input queue; Cancel/pause immediately invalidate proposals and late results. Corrections send bounded request/formula/correction history and revoke the old ActionGate ID before generation.
- Added a display-clamped overlay card near a matching cached Excel cell (fallback when AX/UIA cannot identify the cell), large local monospace formula text, paged explanation in the requested language, referenced-column selectRange, correction count and one-second mouth countdown.
- Confirmation waits for the final review page to paint and records presentation time in main. Trusted ASR onset must follow presentation; a fresh silent mouth hold is required otherwise. Blink/wink clicks on the card are consumed. Dwell can review/correct/cancel/stage undo, never confirm. Existing green style and keyboard-accessible control mirror retained.
- Added connection-local destination snapshots. Exactly one add-in must be connected. Session, worksheet, cell, content and age are checked; duplicate confirmations/commands/snapshots cannot write twice. A changed foreground window, reconnect or edited cell fails closed. Ambiguous outcomes never trigger automatic retries.
- Added in-memory restore of original formulas or primitive values, including literal text beginning with '='. Restore gets a separate fresh ActionGate action and refuses to overwrite a later cell edit. Original values never enter provider context or logs. Q15 sample sharing remains opt-in.
- Updated the actual Excel bridge ADR (0012; 0005 is the pointer ADR) to distinguish documented undo support from unmeasured desktop behavior. Native Ctrl+Z remains unverified, so this step uses guarded snapshot restore. Added ADR0013 and a UI delivery check.
- Bundled @gestura/genai into Electron main because its workspace export points at TypeScript. Added no dependencies, scripts, workflow or runtime network routes. AGENTS.md Hard rules and Commands table unchanged.

Measured checks
- pnpm verify: PASS (lint with zero warnings, all workspace typechecks, 88 test files passed / 426 tests passed; 1 file and 6 tests retain existing skips). Vitest duration 3.34 s on this macOS host.
- Desktop Electron production build: PASS. Excel add-in production build: PASS.
- Focused formula/input/router tests: 21 passed in 3 files.
- Tests cover stale proposals, pre-presentation voice, blink/wink/dwell rejection, correction history/invalidation, simultaneous confirmation, pause during generation, ignored late results, changed foreground, unavailable destination, thrown/ambiguous write failures, separate confirmed restore, gaze Undo staging, talking suppression, snapshot tampering/expiry/session changes, intervening edits, duplicate transport commands, multiple clients and reconnect revisions.
- Fake Office tests exercise explicit String restore for '=literal', worksheet change refusal, ExcelApi 1.16 availability and discontiguous selection's 1.18 guard. No real workbook was changed.
- Scripted UI inspection: observed widths 375 and 1163 CSS px; no horizontal overflow; card body scrollHeight/clientHeight both 288 px. New review controls are nominally 64 px high. Next shows Cantonese explanation, Back returns to formula, Correct opens composer and submitting produces correction 1, Cancel removes the card. See p4.3-ui-check.md for the scoped PASS report.
- Text/background contrast 15.19:1; green/background contrast 7.81:1. Screenshots in /tmp/gestura-p43-{formula,explanation,desktop}.png are temporary scripted evidence.
- git diff --check: PASS. Changes remain uncommitted.

Defaults used
- Q4: spoken confirm/確認 or one-second held mouth; no blink/wink/dwell confirmation.
- Q6: primary display only, DPI-aware conversion for cached target bounds.
- Q12: Traditional Hong Kong Chinese explanations for Cantonese/mixed requests.
- Q13: Office.js bridge. Q15: no sample values without opt-in.

Known issues / follow-ups
- Real desktop Excel (macOS/Windows), actual ASR, camera gestures, remote/local providers and Windows runtime were not exercised. No formula correctness or end-to-end latency claim follows from these tests.
- Native Ctrl+Z support remains unmeasured. Snapshot restore requires ExcelApi 1.16, supports formulas/primitive values and rejects rich/error values before proposal. Separate-column selection requires 1.18; failure is disclosed without writing.
- Snapshot checks are optimistic: a coauthor can edit between Office read and write sync. No cross-client atomic compare-and-swap is claimed. Once Office has received a mutation it cannot be recalled; pause cancels subsequent sends and invalidates outstanding results.
- Undo is in memory and limited to the recent acknowledged formula write. It expires after 60 s and is cleared on reconnect/cancel/new request. Review the receipt's previous content before voice Undo; the gaze Undo tile stages a fresh confirmation card.
- Cell anchoring requires a fresh cached spreadsheet-cell candidate named with the target address. Otherwise the card uses a screen-clamped fallback; inspect AX/UIA coverage on each host.

Manual checks for the human (both macOS and Windows)
- [ ] Start Gestura with the Excel add-in connected exactly once and configured allowlisted formula provider. Select a disposable cell in a test workbook; keep Excel foreground.
- [ ] Request a formula: verify thinking, readable complete formula/explanation review pages, card placement, column selection and no workbook write before confirmation.
- [ ] Blink/wink/dwell on the card: verify no insertion. Review all pages, then speak confirm/確認 or hold the mouth open silently for 1 s; verify countdown and exactly one insertion.
- [ ] Say 'no, use column C' while a proposal is pending; verify correction 1, old proposal revoked and fresh review/confirmation required. Repeat with the gaze Correct composer.
- [ ] Cancel by voice and dwell while thinking/proposed. Pause via hotkey and corner dwell in every state; verify no later result reopens a cancelled card or sends a new write. Resume explicitly.
- [ ] Review receipt/previous content, say 'undo that', verify exact original formula/value/blank restoration. Repeat using gaze Undo plus mouth confirmation, including literal '=text'. Edit the cell manually before Undo and confirm restore refuses to overwrite it.
- [ ] Change worksheet/workbook/window, reconnect add-in, connect a second add-in, wait over 60 s: verify confirmations fail closed. Inspect Excel after any ambiguous timeout; do not assume no mutation occurred.
- [ ] Record actual desktop Ctrl+Z behavior in ADR0012 on both platforms. Check retina/Windows scaling, click-through focus retention, keyboard review mirror, and poor AX/UIA coverage fallback.

Changed files (P4.3 manifest)
- apps/desktop/electron.vite.config.ts
- apps/desktop/src/main/index.ts
- apps/desktop/src/main/formula/controller.ts; controller.test.ts
- apps/desktop/src/main/input/controller.ts; formula.test.ts
- apps/desktop/src/main/excel-bridge/bridge.ts; server.ts; transactions.test.ts
- apps/desktop/src/renderer/control/SpeechSettings.tsx
- apps/desktop/src/renderer/overlay/FormulaCard.tsx; PhrasePalette.tsx
- apps/desktop/src/renderer/shared/styles.css
- packages/core/src/excel.ts; formula-loop.ts; formula-loop.test.ts; palette.ts; index.ts
- packages/genai/src/formula/router.ts; router.test.ts
- integrations/excel-addin/src/taskpane/bridge-client.ts; bridge-client.test.ts; cell-transactions.ts; cell-transactions.test.ts; office.ts; office.test.ts
- docs/decisions/0012-excel-bridge.md; 0013-formula-confirmation-loop.md
- docs/p4.3-ui-check.md; docs/PROGRESS.md

Suggested commit message
feat(P4.3): add confirmed formula correction and guarded Excel restore

## P4.4 — Value-based formula benchmark

Date: 2026-10-17.

Changed
- Replaced the default CSV/self-grading harness with strict JSON cases and a fresh-sheet value evaluator. Cases contain fixture grids, language, optional correction utterance, scalar expected value or accepted formulas, and author-supplied function category. Raw grids default to Sheet1/output AZ1; explicit name/grid/target objects are supported. Oracles are preflighted before any provider request and never enter generator inputs.
- Added pinned HyperFormula 3.5.0 under the approved GPLv3 licence; commercial licensing remains a separate option. It is imported only by the benchmark tool. Added the repo's existing esbuild 0.25 line as a tool dev dependency for an isolated Electron main runner. Documented licence/compatibility limits in ADR0014 and tool README.
- Independent mock response JSON deliberately includes five wrong first responses. One correction uses request/previous formula/correction history, with all failed cases remaining in cumulative accuracy denominators. Equivalent formula spellings are scored by value, with explicit numeric tolerance. Wrong target, unsupported function, timeout and evaluator failures do not silently disappear.
- Reports include overall/language/category accuracy, generation p50/p95, correction p50/p95, cumulative automated end-to-end latency, token calls and estimated USD/request. Missing usage/rates or potentially billed failed calls yields N/A. Mock costs are zero. Expected answers, full grids, API keys and raw HTTP/provider errors are not sent to generators or persisted as diagnostic errors.
- Optional live mode runs only in Electron main with explicit exact-host/port allowlisting, redirect refusal, session block policy and enabled-only local fallback. Provider clients preserve optional token/model metadata. Fixed structured-output requests to send plain JSON Schema rather than serializing Zod internals; Zod still validates responses.
- Optional audio mode reuses local fixture ASR with cancellable playback; capture/export code was not added. Team recordings still require consent manifests. Reports are timestamped JSON/Markdown under docs/benchmarks; running the command is the opt-in, and files can be deleted using Finder/Explorer.
- Updated the existing root command and AGENTS Commands description. Hard rules remain byte-for-byte unchanged. Legacy P4.2 CSV parsing tests remain, but it no longer supplies answers to the scorer.

Measured checks
- pnpm verify: lint zero warnings, workspace typechecks, 94 test files / 457 tests passed; 1 file and 6 existing tests skipped. Vitest duration 4.35 s on this macOS host.
- Electron desktop production build passed. The separate benchmark Electron bundle also builds and runs without the optional ASR chunk being loaded in text mode.
- Latest mock text run: 15 cases, 10/15 first try (66.7%), 15/15 cumulative after correction (100%), 20 generation requests. These are intentionally scripted harness results, NOT LLM accuracy. First generation p50/p95 0.09/1.38 ms; correction 0.10/0.28 ms; automated end-to-end 7.73/21.17 ms; zero provider charges. File: docs/benchmarks/formula-mock-text-2026-10-17T15-19-15-671Z.{json,md}.
- Electron live-transport smoke: loopback stub only, model label scripted-transport-smoke-NOT-LLM; 20 requests, 10/15 first, 15/15 corrected. First generation p50/p95 1.82/41.02 ms; correction 2.03/2.93 ms; automated end-to-end 5.40/50.61 ms. Explicit zero test rates, no real LLM charges. File: docs/benchmarks/formula-live-text-2026-10-17T15-15-37-182Z.{json,md}.
- Real local ASR adapter smoke with bundled sherpa/yue.wav reached evaluation successfully: 7,307.77 ms playback/ASR elapsed, 7,354.79 ms total. Generator returned a constant scripted '=1' solely to test transport. This does NOT measure speech-end latency, ASR correctness or audio formula quality. Temporary report: /tmp/gestura-p44-audio-smoke.json. No new audio was written.
- Combined Electron audio transport smoke also passed: upstream Cantonese WAV -> production local ASR -> FormulaRouter -> one allowlisted local stub call -> evaluator. Constant '=1' response, not a formula-quality task. Generation 60.71 ms; automated playback/ASR/evaluation total 7,192.79 ms. Model label scripted-audio-transport-smoke-NOT-LLM; no charges. Report: docs/benchmarks/formula-live-audio-2026-10-17T15-23-46-257Z.{json,md}.
- Tests cover JSON shape/limits/duplicates, equivalent formulas, all five categories, unsafe/unsupported/volatile/error results, strict numeric tolerance, oracle preflight, no expected-data leakage, correction history/denominators, missing audio, cancellation/timeouts, deterministic latency arithmetic, pricing/usage/model mismatch, retry token accounting, redirect/host/port policy, plain output schemas, report files and redacted provider errors.
- Existing Electron 44.7.1 runtime was missing path.txt; repaired the declared installation using its cached archive to run the smoke test. No Electron version change or source/lock change for that repair.

Defaults and limitations
- Q12: en/yue/mixed case groups; Traditional HK response request retained. Q14: provider-agnostic cloud interface, no real provider chosen or contacted. Q15: headers/addresses/types only unless explicit --share-samples (up to 5 values/column); complete fixture grids stay local. Q16: enabled local fallback only. Q17 remains unmeasured for real LLM quality.
- HyperFormula differs from Excel (notably date/array/name behavior); passing values on a single grid do not prove semantic equivalence or Excel compatibility. No arbitrary generated JavaScript runs. Fixture/engine dimensions are bounded, and volatile functions are rejected for reproducibility.
- Price estimates use supplied model-matched rates/as-of date, excluding cache discounts/tax/machine energy. Unknown costs are not invented. Generation latency includes internal repair/fallback; audio end-to-end includes playback; human correction time is not measured.
- Team formula recordings were not supplied. Only a published upstream ASR sample was used for transport smoke. Windows runtime and real provider billing/accuracy runs remain pending. Platform-neutral code uses the same library on both OSes; no new workflow was added.
- Prior P4.3 changes were already present and remain uncommitted; they were preserved.

Manual checks for the human
- [ ] On macOS and Windows, run pnpm install, then pnpm bench:formula. Inspect the new JSON/Markdown pair and confirm all language/function groups and the explicit mock label.
- [ ] Add independent team JSON cases with scalar values or accepted formulas; include adversarial grids for constants, missing/blank data, booleans, lookups, dates and text. Compare representative results in real Excel.
- [ ] Configure a real provider and exact network allowlist, then run pnpm bench:formula --provider live --app-config /absolute/path/config.json --config /absolute/path/pricing.json. This makes potentially billable requests; supply actual model rates and check token accounting/unknown costs. Never interpret stub/mock reports as model quality.
- [ ] Test a disallowed host/port and redirect: verify no provider request escapes. Keep --share-samples absent and inspect synthetic provider requests to confirm full fixture/oracle data is absent.
- [ ] For audio formula quality, supply existing consented mono 16 kHz WAVs plus correction WAVs and matching case paths/manifest entries; run --mode audio (with live flags for real generation). Check missing audio remains a failure and Ctrl+C stops playback/requests. Do not record through this tool.
- [ ] Remove an unwanted report pair using Finder/Explorer; confirm no uploads. Record real first/corrected accuracy before applying the Phase 5 gate.

Changed files (P4.4 manifest)
- AGENTS.md (Commands description only); package.json; pnpm-lock.yaml
- packages/core/src/formula-bench.ts; formula-bench.test.ts; index.ts
- packages/genai/src/index.ts; providers/cloud.ts; providers/local.ts; providers/usage.test.ts
- packages/genai/src/formula/output-schema.ts; formula/router.ts
- tools/formula-bench/package.json; tsconfig.json; README.md
- tools/formula-bench/src/index.ts; index.test.ts; cases.ts; evaluator.ts; evaluate.ts; evaluate.test.ts
- tools/formula-bench/src/generator.ts; generator.test.ts; cli.ts; cli.test.ts; launch.ts; electron.ts; network.ts; network.test.ts
- tools/voice-bench/src/asr.ts (optional cancellation signal)
- fixtures/formula-cases/p4.4-cases.json; p4.4-mock-responses.json
- docs/benchmarks/README.md and timestamped mock/stub report pairs
- docs/decisions/0014-formula-benchmark.md; docs/PROGRESS.md

Suggested commit message
feat(P4.4): evaluate formula fixtures and report correction accuracy

## P4.4 follow-up — OpenRouter development connection

Date: 2026-10-17.

Changed
- Added root .env.example and a gitignored local .env template (existing .env preserved). User-approved environment setup replaces the earlier proposed encrypted-key setup for development; no safeStorage claim is made. No dependencies, scripts, workflows or Hard rules changed.
- Main reads root .env with Node parseEnv in development only; explicit shell settings take precedence. It does not export file secrets into process.env, and removes inherited OpenRouter variables before creating windows/utility workers. A non-empty key configures openai/gpt-4.1-mini at https://openrouter.ai/api and adds openrouter.ai to the in-memory allowlist. Nothing is written to user config or sent over IPC.
- Added a guarded Electron net.fetch transport to desktop provider calls: exact host/port matching, no URL credentials, refused redirects. Disabled/unconfigured local fallback no longer creates a provider. Missing/empty environment key leaves existing settings unchanged.
- Cloud requests to OpenRouter require structured-output-capable endpoints, data_collection deny and zdr true, per current official routing documentation. Sanitized errors exclude raw HTTP bodies and transport exceptions. Existing ActionGate and sample-sharing controls remain in force.
- Environment fields have a shared core Zod schema. Validate only the new config fields because existing default local-model empty string is not round-trip-valid under the prior AppConfig schema. That existing schema/default inconsistency is a follow-up.

Measured checks
- pnpm verify PASS: lint zero warnings, all workspace typechecks, 97 test files / 467 tests passed; 1 file / 6 existing tests skipped. Vitest 5.75 s on this macOS host.
- Desktop production build PASS (existing third-party Rollup annotation warnings only). git diff --check PASS. .env confirmed ignored by Git; local mode 0600.
- New tests cover environment parsing/precedence, absence/empty key, secret removal, default model/allowlist, invalid settings with redacted errors, exact endpoint and JSON/privacy routing, request blocking/redirect refusal, sanitized provider failure and missing local fallback. All transport tests use fakes; no paid provider request made.

Manual checks and limitations
- User: paste the key locally into .env, quit the running instance, then pnpm dev (or pnpm excel:dev with the existing Excel add-in setup). Request an English/Cantonese formula in a disposable workbook, review/correct/cancel, and verify only explicit voice/mouth confirmation writes once. Test pause throughout.
- Actual key, account credits, live model response/accuracy, privacy-compatible endpoint availability and Windows runtime remain unverified. Run the same setup on Windows. Starting the app does not itself generate a billable request.
- .env is plaintext local development configuration. Packaged builds read only explicit environment variables. Encrypted production credential storage/UI is a follow-up. Benchmark live mode retains its explicit --app-config flow and does not read this .env.
- Setup instructions: docs/openrouter-setup.md, including account troubleshooting and official provider docs. No new region assumption; Q15 sample values remain opt-in. Prior P4.3/P4.4 uncommitted changes preserved.

Changed files (this follow-up)
- .env.example; .env (ignored local file)
- apps/desktop/src/main/config.ts; openrouter.test.ts; index.ts
- apps/desktop/src/main/network/provider-fetch.ts; provider-fetch.test.ts
- packages/core/src/config/index.ts
- packages/genai/src/providers/cloud.ts; openrouter.test.ts
- packages/genai/src/formula/router.ts; router.test.ts
- docs/openrouter-setup.md; docs/PROGRESS.md

Suggested commit message
fix(P4.4): connect OpenRouter through private environment configuration

## P5.1 — Confirmed VS Code code proposals

Date: 2026-10-18 (started 2026-10-17).

Changed
- Replaced the VS Code placeholder runtime with a desktop extension host. Build bundles CommonJS and emits a loadable unscoped manifest in integrations/vscode/dist, while retaining the scoped pnpm workspace name. Added pnpm vscode:build and its AGENTS Commands entry. Reused existing ws/esbuild/Zod versions; added development-only VS Code API types. No workflow, release or git write was added.
- Added a one-client loopback WebSocket bridge with bearer authentication, browser-Origin rejection, no redirects/compression and bounded strict Zod messages. A 256-bit token rotates at desktop startup and is atomically published under ~/.gestura-vscode/pairing.json. The extension retries local pairing and never sees provider keys. Hardened the shared timing-safe token comparison against non-ASCII byte-length mismatches.
- Added native permission helpers under macos/windows: mode 0700 on macOS; a protected owner-only inheritable Windows DACL before token publication. New files use 0600 / protected directory inheritance. Publication fails closed if protection is unavailable. Normal exit attempts cleanup; a crash/stale file is replaced at next startup. No claim is made against other same-user processes or privileged OS administrators.
- getContext shares only languageId, filename basename, selected text and at most 40 cursor-surrounding lines. Selection and surrounding text each cap at 16,000 characters. URI, version, selection offsets and complete document snapshots remain extension-local. The local snapshot/preview limit is one million characters. Recorded the user-approved code equivalent of Q15 in open-questions.md; existing Q15 status/default remains unchanged. The maintainer's Phase 4 benchmark-gate confirmation is recorded as an attestation, not a new measured result.
- Added structured code responses with status/code/insertion mode and English + Traditional HK explanations, validated with Zod and one schema-repair retry. Code requests use the existing configured main-only allowlisted cloud transport. Correction history contains user request / previous code / correction, capped at 20 messages. No code fallback model was added (Q16 remains single-function formulas/intent only).
- Added read-only VS Code virtual-document diffs beside the source and reused the existing paginated Gestura proposal card, countdown, dwell controls and green style. Preview, source visibility and focus are checked before approval can apply. Cancellation/pause/disconnect clear preview state; cancellation closes Gestura's virtual diff tabs. Opened virtual document buffers may remain in VS Code's own cache until collected.
- Main's write boundary accepts only an ActionGate-minted ConfirmedAction, then sends a single-use snapshot/preview reference; no serialized object is treated as a branded capability. Extension writes only one WorkspaceEdit after checking exact source URI/version/text/selection/cursor and a focused paired window. No automatic save, generated-code execution, terminal/tasks/debug API or child process is used.
- Corrections revoke old proposal IDs. Old/stale/paused/reconnected/changed destinations fail closed. Undo is an independently previewed and confirmed inverse WorkspaceEdit, with exact local document matching; it refuses intervening edits. Ambiguous results are never retried automatically. Pause cannot recall an edit already accepted by VS Code.
- Added a Code request palette composer; free-form unmatched speech routes to code in VS Code. Existing review/correct/cancel/undo controls remain available by dwell, with silent mouth confirmation for gaze-only mode. Updated proposal labels without changing layout or adding small interactive status controls. Full explanations remain in the card; short status messages are capped to their IPC schema bound.
- Added the VS Code execution lint boundary and a violating fixture. It catches child_process import/require/dynamic imports, terminal/tasks/debug APIs, aliases/destructuring and arbitrary executeCommand calls; only the literal vscode.diff command is allowed. It is a development guard, not an obfuscation-resistant sandbox.

Measured checks
- pnpm verify: lint zero warnings, all workspace typechecks; 106 test files / 498 tests passed, with 1 file / 6 existing tests skipped. Vitest duration 4.54 s on this macOS host.
- pnpm vscode:build PASS; generated extension manifest smoke PASS; bundled extension loads with mocked VS Code API and exports activate. No extension activation or provider request was made by that bundle-load smoke.
- Electron desktop production build PASS (existing third-party Rollup annotation warnings only).
- pnpm native:build PASS on darwin-arm64. Native helper smoke with the built addon repaired a temporary 0755 directory to 0700; no input was injected.
- cargo clippy -- -D warnings PASS on aarch64-apple-darwin, x86_64-apple-darwin and x86_64-pc-windows-msvc targets. Windows is a cross-target compile/lint check, not an ACL/runtime acceptance test.
- Added tests cover bounded/no-extra context, bilingual response schemas, repair retry/correction history, cancellation, token publication/failure/rotation, real loopback authentication/protocol parsing, branded/single-use/revision-bound writes, expiry, changed documents/selections, cancel/pause/reconnect, simultaneous duplicate writes, both insert modes, inverse edits and intervening-edit rejection. Gaze-composed requests and click rejection are tested through InputController.
- Full synthetic loopback test PASS: fake editor -> bounded context -> code proposal -> real ActionGate fresh voice confirmation -> one edit -> separate mouth-confirmed inverse edit -> original text restored. No actual document, camera, microphone, native input or paid provider was used. No accuracy or human timing claim follows from these tests.
- git diff --check PASS. AGENTS Hard rules compared against HEAD and unchanged. Changes remain uncommitted.

Defaults / limitations
- Q4 voice-confirm or a fresh one-second silent mouth hold; no blink/wink/dwell confirmation. Q6 primary display; Q8 no interaction logging; Q12 Traditional Hong Kong Chinese; Q15 Excel sample values still opt-in; separate code context policy as explicitly requested. Phase 4 gate accepted from the maintainer's statement.
- Actual VS Code runtime/visible diff behavior, real voice/head/mouth operation and Windows permissions/runtime remain manual acceptance checks. Windows builds must rebuild the native addon to include the permission helper. A missing helper disables only the VS Code bridge.
- Code generation requires the configured cloud provider; no code-quality benchmark was requested/run. Local editor snapshots and restore are in memory only and expire after 60 seconds from context capture, including inference/review time. Other extensions can react to edits; no cross-extension atomic isolation is claimed.
- The extension intentionally handles trusted local file/untitled documents only. Remote workspaces, Codespaces, notebook/custom editors and multiple paired windows are follow-ups. No broader workspace scan or context option was added.

Manual checks (macOS and Windows)
- Run pnpm install, pnpm native:build, pnpm vscode:build and pnpm dev. Open a development VS Code window with --extensionDevelopmentPath pointing to integrations/vscode/dist, then open a trusted disposable local code file. Confirm connected status and reconnect after restarting Gestura. Check Windows owner-only ACLs with icacls and macOS mode bits.
- Select text / place a cursor, keep the source visible and use Code request by dwell or speak a free-form request. Inspect the beside read-only diff and complete paginated code/explanation card. Verify no edit before fresh voice/mouth confirmation, exactly one edit after it, and no auto-save or execution.
- Correct by voice and gaze composition; check correction counter, history, old proposal invalidation and fresh confirmation. Cancel and pause during generation/review/confirmation. Blink/wink/dwell on the card must never insert.
- Stage Undo that by voice/dwell, review inverse diff, then separately confirm. Edit the document, move selection, switch documents/windows, disconnect or expire the snapshot before confirm/undo; verify rejection and no overwrite.
- Exercise gaze-only mode with mic off, silent mouth countdown, all review pages, correction composer, cancel and undo. Check both Retina and Windows scaling. Inspect terminal/tasks/debug history to confirm no execution side effect.
- Follow integrations/vscode/README.md for startup, pairing and troubleshooting. Record real editor and Windows acceptance results before claiming those checks passed.

Changed files (P5.1 manifest)
- AGENTS.md (Commands only); package.json; pnpm-lock.yaml; eslint.config.mjs
- integrations/vscode/package.json; tsconfig.json; build.mjs; README.md
- integrations/vscode/src/extension.ts; transactions.ts; transactions.test.ts
- packages/core/src/code.ts; code.test.ts; formula-loop.ts; palette.ts; index.ts
- packages/genai/src/code/router.ts; router.test.ts; packages/genai/src/index.ts
- apps/desktop/src/main/index.ts; input/controller.ts; input/code.test.ts
- apps/desktop/src/main/vscode-bridge/server.ts; server.test.ts; bridge.ts; bridge.test.ts
- apps/desktop/src/main/vscode-bridge/controller.ts; controller.test.ts; pairing.ts; pairing.test.ts; integration.test.ts
- apps/desktop/src/main/excel-bridge/token.ts; token.test.ts
- apps/desktop/src/renderer/overlay/FormulaCard.tsx; renderer/control/SpeechSettings.tsx
- native/gestura-native/Cargo.toml; index.d.ts; src/lib.rs; src/macos/mod.rs; src/macos/pairing.rs; src/windows/mod.rs; src/windows/pairing.rs
- tools/eslint/vscode-boundary.mjs; tools/lint-boundaries.test.ts; tools/lint-fixtures/vscode-violation.ts.fixture
- docs/open-questions.md; docs/decisions/0015-vscode-code-proposals.md; docs/PROGRESS.md

Suggested commit message
feat(P5.1): add confirmed VS Code code proposals and guarded edits

## P5.2 — GenAI for selected plain-text fields

Date: 2026-10-18.

Changed
- Extended the native accessibility worker with focused-text capture, guarded post-insertion checks and verified insertion-range selection for undo. Windows uses the dedicated COM/UIA thread, current focus/enable/password/offscreen properties, writable ValuePattern and TextPattern.GetSelection. macOS uses AX focused application/element, editable value and selection attributes. No field value, clipboard, screen pixels or unrelated window text is read for context.
- Native snapshots retain field identity, original selected range/text and an opaque UUID for 60 seconds. Windows navigates range endpoints in TextUnit_Character units and checks endpoint equality; DocumentRange is collapsed/moved as metadata before GetText reads only the selected/owned range. macOS uses AXSelectedTextRange and bounded AXStringForRange. Known terminal/command hosts and VS Code are rejected as plain-text destinations; VS Code retains its dedicated integration.
- Added strict core schemas for selected text, request, response, register and field-bound write capabilities. Selection/output cap at 10,000 UTF-16 units; invalid control/surrogate characters and extra context fields are rejected. Provider inputs are only selected text, operation, user instruction and requested register; field tokens/identity/ranges remain local.
- Added main-only PlainTextRouter through the existing allowlisted provider, structured JSON and one schema/register repair retry. Chinese output remains Traditional HK. Per the maintainer's explicit reply, English translation switches to colloquial Cantonese with 口語; 書面語 restores the original English translation request. Every toggle uses the original selection, revokes the old ActionGate ID and requires new review/confirmation.
- Added English/Cantonese/mixed rewrite, reply and translation intents to commands.yaml and regenerated the validated catalogue. Added gaze-only parity paths, including a reply instruction composer. Explicit text intents route before generic formula/code correction handling.
- Reused the paginated proposal card and existing green/system-font UI, with a 64px 書面語/口語 register tile. Plain text uses the system font; compact layouts use shorter review pages and conservative CJK line widths. Register/review/cancel controls remain dwell-operated. Only fresh voice-confirm or silent one-second mouth evidence can insert; blink/wink/dwell cannot confirm.
- NativeBridge.typeText now accepts additional field-bound ActionGate capabilities. It validates and consumes each capability once, checks the focused selection before typing, and checks the exact newly inserted range after each Unicode chunk, allowing CRLF/LF normalization. Pause revisions are checked across awaits. No Enter/Send, clipboard paste, shell, code execution or automatic submit command is introduced.
- Undo stages a separate proposal and confirmation. After validating focus/caret/owned insertion, native selects only that range; NativeBridge types the original selection or sends one Backspace for an originally empty selection. No broad Ctrl+Z, guessed deletion count or automatic retry is used. Interrupted/uncertain insertions disclose possible partial text and do not create an undo receipt.
- Added setup/acceptance guide and ADR0016; recorded the selected-context and register decision in open-questions.md. No new dependencies, scripts or workflows; AGENTS Commands table required no P5.2 change and Hard rules remain unchanged. Existing uncommitted P5.1 work was preserved.

Measured checks
- pnpm verify PASS: lint zero warnings, all workspace typechecks, 112 test files / 515 tests passed; 1 file / 6 existing tests skipped. Final Vitest duration 4.46 s on this macOS host.
- pnpm native:build PASS for darwin-arm64. All three new native exports are present; the export smoke performed no accessibility query or input.
- Electron desktop production build PASS, with existing third-party Rollup annotation warnings only.
- cargo clippy -D warnings PASS on aarch64-apple-darwin, x86_64-apple-darwin and x86_64-pc-windows-msvc. Windows is a cross-target compile/lint check, not a live UIA/provider test.
- cargo test --no-default-features PASS: 7 tests. The fake accessibility worker exercises text capture/check dispatch; host filtering tests reject known execution surfaces. No live field was queried.
- MockProvider + actual main NativeBridge + MockNativeInput full-flow tests PASS: selected-only request -> proposal -> fresh voice/mouth confirmation -> one insertion -> separately confirmed restoration/removal. Tests cover register round-trip/original-source reuse, prior proposal invalidation, review requirements, forbidden click evidence, stale voice, duplicate confirmation, unavailable fields, selection/focus changes, expiry, pause/cancel, Unicode/symbols, chunk interruption, wrong schema/register and one repair retry.
- InputController gaze-only test PASS at a 375px-wide scripted display: rewrite tile, 64px register control, card control bounds, register re-request, click rejection and silent mouth-confirmed insertion; microphone was never enabled. Additional core test covers one-line review pagination on shorter displays.
- Antislop visual verification remains pending: the browser approval gate declined opening the local scripted UI preview (http://127.0.0.1:4199). No alternate browser or workaround was attempted. The fixture server was stopped after denial. Automated state/geometry tests and builds do not constitute a visual pass.
- git diff --check PASS. AGENTS Hard rules compared with HEAD and unchanged. No live provider calls, camera/mic capture, real OS text insertion or user-data recording occurred during this step.

Defaults and limitations
- Q4: fresh voice-confirm or one-second silent mouth hold; never blink/wink/dwell confirmation. Q8: no interaction logging. Q12: Traditional HK Chinese, with explicit per-proposal written/colloquial register. Q15 for Excel unchanged; separate selected-only text policy documented. Phase 4 gate accepted from the maintainer's statement, not re-measured here.
- Real macOS/Windows field compatibility, visible layout and IME behavior remain manual acceptance checks. Unsupported providers, read-only/password fields, missing selection APIs or unavailable native helpers fail closed; there is no clipboard/full-field fallback. Rebuild the native addon on each OS.
- Arbitrary fields expose no common version/transaction API. Focus/range/content guards are optimistic, and other applications can change focus between OS calls. A mismatch stops later chunks but cannot recall delivered input. Insertion/undo acknowledgements are never automatically retried. Known-host filtering is not a sandbox against arbitrary applications or other same-user software.
- The native snapshot lifetime starts at capture, so inference/review consume the same 60-second window. Snapshot objects are retained only in memory and become unusable at expiry; memory is replaced by later capture or released at process exit. No field contents or receipts are persisted.

Manual checks (macOS and Windows)
- Quit Gestura, run pnpm native:build and pnpm dev with the existing provider settings. On macOS grant Accessibility permission. Use a disposable plain-text field in TextEdit/Notepad or another target application.
- Test formal rewrite, English/Chinese translation and reply with empty/nonempty selection in English/Cantonese/mixed commands. Include Chinese, emoji, line endings and = ( ) : $. Confirm only selected text accompanies the request; no whole-field/clipboard fallback should occur.
- Verify complete card text/explanations and all register/review/cancel controls at narrow width and shorter display scaling. Toggle English -> Cantonese -> English and verify original selection is reused. Cancel before confirmation must leave text and selection unchanged.
- Verify fresh voice/silent mouth confirmation inserts once; blink/wink/dwell and repeated confirm do not insert. Exercise gaze-only request composition, register controls, review, cancel and staged undo with mic off.
- Change focus/field/selection, expire the snapshot or pause before/during insertion. Verify refusal or disclosed partial insertion, without later automatic injection. Inspect the destination before retrying an uncertain result.
- Stage Undo that, review and separately confirm restoration/removal. Move/change the insertion range first and verify refusal to overwrite unrelated text. Verify no Enter/Send, broad Ctrl+Z or execution command occurs.
- Test read-only, password and unsupported controls and known terminal/VS Code hosts: no provider request or plain-text injection. Record actual supported/unsupported applications without claiming unmeasured coverage.
- Follow docs/plain-text-setup.md; complete the visual check denied to the agent and Windows runtime acceptance before marking those checks passed.

Changed files (P5.2 manifest)
- packages/core/src/plain-text.ts; plain-text.test.ts; intent.ts; formula-loop.ts; palette.ts; palette.test.ts; index.ts
- packages/intent/commands.yaml; src/commands.generated.json; src/matcher.ts; src/plain-text.test.ts
- packages/genai/src/plain-text/router.ts; router.test.ts; packages/genai/src/index.ts
- apps/desktop/src/main/plain-text/controller.ts; controller.test.ts
- apps/desktop/src/main/native/index.ts; native/plain-text.test.ts
- apps/desktop/src/main/input/controller.ts; input/plain-text.test.ts; apps/desktop/src/main/index.ts
- apps/desktop/src/renderer/overlay/FormulaCard.tsx; renderer/shared/styles.css
- native/gestura-native/index.d.ts; mock/index.ts; src/ui.rs
- native/gestura-native/src/macos/mod.rs; ui.rs; text.rs; src/windows/mod.rs; ui.rs; text.rs
- docs/open-questions.md; docs/plain-text-setup.md; docs/decisions/0016-plain-text-selected-fields.md; docs/PROGRESS.md

Suggested commit message
feat(P5.2): add confirmed selected-field text generation and register switching
