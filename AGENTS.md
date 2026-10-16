# AGENTS.md — Gestura

Read this file and `docs/PROGRESS.md` before every task. Package-level `AGENTS.md`
files add rules for their folder; the closest file wins, but nothing below
"Hard rules" can be overridden anywhere.

## What Gestura is

A hands-free input tool for laptops and desktops:

- Head pose + eye gaze (webcam) → cursor control, helped by target snapping
- Deliberate blinks / winks / dwell → clicks
- Speech (Cantonese, English, code-mixed) and mouth gestures → commands and
  Generative AI actions (MVP: Excel formulas first; VS Code and plain text later)

It is NOT a medical device and NOT for users without reliable voluntary eye or
head control. Users with speech impairments use gaze-only mode with a phrase
palette.

### Platforms

macOS (Apple Silicon and Intel) and Windows 11, both from day one. The lead
developer works on macOS; a Windows teammate checks every step. Every feature,
test and CI job must pass on both. Platform-specific code lives only in
`native/gestura-native/src/macos` and `src/windows`, behind one shared
interface. On macOS, cursor control and UI element queries need the
Accessibility permission; camera and microphone need their own permissions.

### Targets (tests and benchmarks should measure these)

| Area       | Target                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Pointing   | ≥ 85% hit rate on standard UI elements; cursor latency < 100 ms (p95); false clicks < 5%                 |
| Effort     | ≥ 60% fewer physical input actions, ≥ 40% less task time vs head mouse + on-screen keyboard (hypothesis) |
| GenAI      | ≥ 80% formulas correct first time; ≥ 95% after one spoken correction                                     |
| Voice      | ≥ 90% of scripted Cantonese / English / code-mixed commands → correct intent                             |
| Onboarding | Setup + calibration < 2 min, unaided; SUS ≥ 68                                                           |
| Privacy    | No video or audio leaves the device (PDPO, PCPD AI Model Framework)                                      |

## Hard rules (only the human maintainer may edit this section)

1. **No autonomous action.** Anything inserted on the user's behalf — GenAI
   text, formulas or code, and dictated text — goes only through `ActionGate`
   (`apps/desktop/src/main/action-gate/`) after a fresh, explicit user
   confirmation. Integration write APIs accept
   only a `ConfirmedAction` minted by `ActionGate`. Never write code that runs
   generated code, sends messages, deletes files or makes payments.
2. **Confirmation is never a click gesture.** A blink, wink or dwell click must
   not be able to confirm a GenAI action.
3. **Media stays on device.** Camera frames and audio samples never leave the
   process that captures them. Only derived features (landmarks, blendshapes,
   transcripts) cross IPC. Never write frames or audio to disk. Fixtures store
   landmarks only.
4. **Network allowlist.** Only `packages/genai`, called from the main process,
   may make outbound requests, and only to hosts in `config.network.allowlist`.
   `packages/pointer`, `packages/gestures`, `packages/intent`, the vision
   worker and the speech process must not import any network API. MediaPipe
   WASM and all model files are bundled locally; never load them from a CDN.
5. **No reporting on individuals.** No telemetry, analytics SDKs or uploading
   crash reporters. Logs are local, opt-in and user-deletable. Never add a
   feature that reports usage, speed or errors to an employer.
6. **No training data.** Never collect user data for training. Never train
   custom models.
7. **Always stoppable.** The global pause gesture and the pause hotkey must
   work in every mode. Never disable or bypass them.
8. **Gaze-only parity.** Every feature must be reachable without speech.
9. **No medical claims** in UI copy, docs or comments.
10. **Electron security.** `contextIsolation: true`, `sandbox: true`,
    `nodeIntegration: false`, strict CSP, typed narrow preload API, every IPC
    payload validated with zod schemas from `packages/core`.

11. **No git writes. The human commits and pushes.** Never run `git commit`,
    `git push`, `git merge`, `git rebase`, `git reset`, `git tag`,
    `git stash`, `git checkout`/`git switch` of another branch, `git add`,
    or anything that changes history, the index, branches or a remote.
    Never create commits, branches, pull requests or releases through the
    GitHub CLI, API or any MCP tool. Read-only git (`git status`,
    `git diff`, `git log`, `git show`) is allowed. When work is done, stop
    and suggest a commit message instead.

If a task seems to require breaking a hard rule, stop and ask.

## Repo map

```
apps/desktop/
  src/main/               Electron main: windows, IPC router, ActionGate, network policy, native bridge
  src/preload/            contextBridge APIs (typed, minimal)
  src/renderer/overlay/   transparent click-through overlay: cursor ring, snap highlight, confirmation card
  src/renderer/control/   settings, calibration, phrase palette
  src/renderer/vision/    hidden window: camera + MediaPipe Face Landmarker → FaceFrame
  src/utility/speech/     utilityProcess: VAD + SenseVoice (sherpa-onnx) → Transcript
packages/core/            shared types, zod schemas (IPC, events, config)
packages/pointer/         PURE: head pose → cursor, One Euro filter, gaze jump, dwell, snapping scorer
packages/gestures/        PURE: blink / wink / mouth state machines
packages/intent/          PURE: command grammar (en, yue, mixed) → Intent
packages/genai/           provider interface, JSON schemas, prompts, validators, local fallback
native/gestura-native/    Rust (napi-rs): input injection, UI element queries (Windows UIA, macOS AX), foreground app
integrations/excel-addin/ Office.js add-in (Excel bridge)
integrations/vscode/      VS Code extension (Phase 5)
tools/replay/             record / replay FaceFrame streams (landmarks only)
tools/pointing-bench/     target-practice harness: hit rate, false clicks, latency
tools/voice-bench/        scripted command evaluation
tools/formula-bench/      formula request evaluation
fixtures/                 landmark JSONL, transcript sets, formula cases (no images, no audio of real users)
models/                   downloaded model files (gitignored; fetch with `pnpm models:fetch`)
docs/                     PROGRESS.md, open-questions.md, decisions/ (ADRs)
```

## Commands

| Task                                               | Command                                     |
| -------------------------------------------------- | ------------------------------------------- |
| Install                                            | `pnpm install`                              |
| Fetch models                                       | `pnpm models:fetch`                         |
| Build native addon (current platform)              | `pnpm native:build`                         |
| Native demo / UI element probe                     | `pnpm native:demo` / `pnpm native:ui-probe` |
| Native moveTo latency (1,000 calls)                 | `pnpm native:bench`                         |
| Run app (dev)                                      | `pnpm dev`                                  |
| Lint + typecheck + test (run before saying "done") | `pnpm verify`                               |
| Unit tests only                                    | `pnpm test`                                 |
| Pointing benchmark (local UI, opt-in reports)       | `pnpm bench:pointing`                       |
| Voice intent benchmark (text CSV; audio optional)   | `pnpm bench:voice`                          |
| Voice ASR WAV latency (local models required)       | `pnpm bench:voice:asr`                      |
| Regenerate validated intent catalogue              | `pnpm intents:generate`                    |
| Formula benchmark                                  | `pnpm bench:formula`                        |

If a command here does not exist yet, create it in the step that needs it and
update this table.

## Architecture rules

- Pure logic lives in `packages/*` and has no Electron, DOM, filesystem or
  network imports. Side effects live in `apps/desktop` and `native/`.
- Hot path (camera frame → cursor move) has a 100 ms p95 budget:
  capture ≈ 33 ms, inference ≤ 25 ms, filter + fusion ≤ 2 ms, IPC + native ≤ 5 ms.
  Nothing async, network-bound or allocation-heavy goes on it.
- Every pipeline stage stamps `t_capture` and its own timestamp so latency can
  be measured end to end.
- All config has a zod schema and a default in `packages/core/config`.
- GenAI responses use structured JSON output validated against a schema;
  never parse free-form model text.

## Conventions

- TypeScript strict, ESM, no `any`, no default exports in packages.
- Renderer UI: React + TypeScript (electron-vite template in `apps/desktop`)
  with Tailwind CSS and shadcn/ui. Do not add another UI framework.
- UI components may come from 21st.dev via the 21st-ui skill / MCP, at
  development time only. Before keeping one: remove any runtime network use
  (web fonts, CDN images, remote scripts), check its licence, and adapt it
  to the accessibility rules below. Do not use it for the overlay window.
- Accessibility rules for all UI: interactive targets ≥ 48 px (phrase palette
  tiles ≥ 64 px); nothing reachable only by hover; WCAG AA contrast or better;
  respect reduced motion and keep animation minimal (motion pulls the user's
  gaze); everything operable by dwell.
- Tests: Vitest. Every pure module ships with unit tests; gesture and pointer
  logic is tested against replay fixtures in `fixtures/landmarks/`.
- Rust: `cargo clippy -D warnings`; no `unwrap()` outside tests.
- Use the "primary" modifier (Cmd on macOS, Ctrl on Windows) instead of
  hard-coding either. Coordinates are logical: points on macOS, DPI-aware
  pixels on Windows.
- New dependency → say why in the PR/plan, prefer actively maintained
  packages, and confirm it works on both macOS and Windows. Check current docs for Electron, `@mediapipe/tasks-vision`,
  `sherpa-onnx` and Office.js rather than relying on memory.
- Suggested commit messages start with the plan step ID, e.g.
  `feat(P2.4): ...`. Suggest only; never commit (hard rule 11).

## Testing without hardware

You cannot see the camera, hear the microphone or watch the screen. Use:

- `tools/replay` fixtures instead of a live camera
- WAV files in `fixtures/audio/` (synthetic or team-recorded with consent) instead of a mic
- `MockProvider` in `packages/genai` instead of a live LLM
- A fake native module (`native/gestura-native/mock`) in unit tests

Tell the human exactly what to check manually at the end of each task.

## How to work in this repo

1. Read this file, `docs/PROGRESS.md` and `docs/open-questions.md`.
2. Propose a short plan (files to touch, tests to add) and wait for approval.
3. Stay inside the step's scope; list anything else as a follow-up.
4. Run `pnpm verify` and show the result.
5. Append to `docs/PROGRESS.md`: step ID, what changed, measured numbers,
   known issues, manual checks for the human.
6. End with a list of changed files and a suggested commit message. Leave
   the changes uncommitted for the human to review, commit and push.
7. If you hit an open question, use the documented default and say so;
   never invent a new requirement.
