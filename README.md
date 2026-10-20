# Gestura

Hands-free desktop input using head movement, eye gestures and optional Cantonese, English or mixed-language speech.

## Team name

**Keyboard Cursor - 1057**

## What the product does

Gestura combines local camera tracking, native mouse input and on-device speech recognition with a confirmation step for generated content. It is intended for people who can voluntarily control their head and eyes and want to reduce their dependence on a physical mouse and keyboard.

**Status:** development prototype for macOS and Windows 11. Features below exist in the source, but live hardware reliability and Windows acceptance still need checking. Passing automated tests does not establish that camera tracking, microphone capture or clicks work on a particular computer. See [progress](docs/PROGRESS.md) for results and outstanding checks.

### Functionalities

| Area | Functionality |
| --- | --- |
| Pointer | Head movement controls the primary-display cursor, with calibration, smoothing, adjustable gain and optional calibrated gaze jumps. |
| Clicking | Deliberate long blink for left-click, right-eye wink for right-click, or dwell as an alternative mode. |
| Target snapping | Optional per-app selection of nearby accessible controls at click time; movement remains free. |
| Speech | Local Cantonese, English and mixed-language commands, including clicks, scrolling, drag, pause and dictation. |
| Gaze-only operation | Phrase palette, keys, edit commands and request composition without turning on the microphone. |
| Generative AI | Excel formula proposals, VS Code code proposals and selected-text rewriting, replies and translation. |
| User control | Review, correction, cancellation and explicit confirmation before generated or dictated content is inserted. |
| Evaluation | Replay fixtures and local pointing, voice and formula benchmark tools. |

Gestura can click Finder, the Dock and other applications once native pointer control and permissions work. A general voice command to launch any named application or folder is not currently implemented.

## How it works

1. A local vision renderer reads the webcam and extracts face landmarks, head pose and eye/mouth signals. Camera pixels are not sent to the control window or an AI provider.
2. Pure TypeScript modules turn these features into a filtered cursor position and deliberate gesture events.
3. The desktop main process checks pause state and sends approved input operations through the Rust native bridge to macOS or Windows.
4. When listening is enabled, local audio capture feeds the on-device VAD and SenseVoice recognizer. Transcripts are matched to commands.
5. A GenAI request sends only its permitted text context to the configured provider. The response is schema-validated and shown as a proposal.
6. Fresh voice confirmation or a held mouth gesture allows `ActionGate` to authorize one insertion. Corrections invalidate the old proposal. Blink, wink and dwell never confirm generated content.

## Setup

### Supported operating systems and prerequisites

| Platform | Native target | Additional requirements |
| --- | --- | --- |
| macOS, Apple Silicon | `darwin-arm64` | Xcode Command Line Tools; camera, microphone and Accessibility permissions as needed. |
| macOS, Intel | `darwin-x64` | Same permissions and build tools as Apple Silicon. |
| Windows 11, x64 | `win32-x64` | MSVC C++ build tools and Windows SDK; camera and microphone access for desktop apps. |

Linux and Windows ARM64 are not supported native targets in this repository. The instructions below run the development app; production installers are not yet documented as ready for distribution.

Install these prerequisites using their official instructions:

- Node.js 22.13 or newer as a setup baseline. The repository declares Node.js `>=22`.
- **pnpm 12.11.2**, matching the repository's `packageManager` field. See [pnpm installation](https://pnpm.io/installation).
- Stable Rust and Cargo. See [Rust installation](https://www.rust-lang.org/tools/install).
- On macOS, install Apple's [Command Line Tools](https://developer.apple.com/documentation/xcode/installing-the-command-line-tools/). On Windows, install the MSVC C++ build tools required by [Rust's Windows setup](https://doc.rust-lang.org/book/ch01-01-installation.html).

Check your tools:

```sh
node -v
pnpm -v
rustc -V
cargo -V
```

On macOS, `xcode-select -p` should print the installed developer tools path. On Windows, use a Visual Studio developer terminal to check that the MSVC compiler and linker are available.

### Install and launch on either platform

Open a terminal in this repository's root folder:

```sh
pnpm install
pnpm models:fetch
pnpm native:build
pnpm dev
```

`models:fetch` downloads and verifies the configured face and speech models and prepares local runtime assets. This setup step requires internet access; models and WASM are local at runtime. `native:build` builds the addon for the current computer.

Use the **Gestura Control desktop window**. A browser preview of the UI cannot provide native system-wide mouse control.

### macOS permissions

1. Start the desktop app and request camera access by starting calibration or camera tracking.
2. Open **System Settings → Privacy & Security → Camera** and allow the app if requested.
3. Enable pointer control and grant **Accessibility** access to the running development **Electron** app or packaged Gestura app.
4. Choose **Start listening** to request microphone access. Allow the app under **Privacy & Security → Microphone**.
5. Quit and restart the app after changing permissions, then re-enable the relevant controls.

The development app may appear as **Electron**, rather than Gestura. If Accessibility does not list it, use the **+** button and select the actual Electron app used by this checkout. To locate that app from the repository root:

```sh
pnpm --filter @gestura/desktop exec node -p "require('node:path').join(require('node:path').dirname(require.resolve('electron/package.json')), 'dist', 'Electron.app')"
```

Copy the resulting path into Finder's **Go → Go to Folder** or the permission file picker. Do not grant unrelated applications access as a substitute. A previously denied camera or microphone permission may need changing in System Settings before retrying; see [Electron's permission documentation](https://www.electronjs.org/docs/latest/api/system-preferences).

### Windows permissions

Enable camera and microphone access, including access for desktop apps, in **Settings → Privacy & security**. Start tracking and listening from Gestura afterward. The native permission API returns true on Windows; that does not guarantee input delivery to every application. Test ordinary applications first: Windows can restrict injected input across different privilege levels.

## First use

1. Open **Gestura Control** and start first-run calibration. If the app says paused, choose **Resume input**.
2. Complete camera framing, a three-second neutral pose capture, comfortable movement toward each edge, blink calibration and the five-target practice. Gaze calibration is optional and skipped when gaze is off.
3. Save the profile. It stays as JSON in the app's local user-data folder.
4. In settings, choose **Start camera tracking**, then **Enable pointer control**. Scroll the control window to find **Head pointer** and **Click gestures**.
5. Choose **Use blink / right wink** or **Use dwell clicks**. These are separate modes; selecting dwell disables blink clicking.
6. Try a harmless target in another application. Confirm that the actual system pointer moves and the application responds, rather than only watching the overlay ring.

Camera tracking, pointer control, click mode and listening are separate controls. Seeing the UI or a circle alone does not mean all four are enabled. Calibration and replay can show a practice pointer without injecting native input.

### Gestures and shortcuts

| Action | How to use it |
| --- | --- |
| Left-click | In blink mode, close both eyes deliberately and reopen. Default accepted duration is 400–1500 ms; calibration can change the minimum. |
| Right-click | In blink mode, keep the left eye open, close the **right eye** for at least 250 ms, then reopen. Left-eye winks do not click. |
| Dwell click | Select dwell mode and keep the cursor within the configured area until the progress ring completes. |
| Pause/resume | **Ctrl+Option+P** on macOS; **Ctrl+Alt+P** on Windows; or the overlay corner dwell control. Leave the corner before using it again. |
| Toggle listening | **Ctrl+Option+L** on macOS; **Ctrl+Alt+L** on Windows; the Listen tile; or the held-mouth gesture when allowed. |
| Confirm a proposal | Say **“confirm” / 「確認」**, or hold the mouth gesture for the one-second confirmation countdown after reviewing the proposal. |

Short natural blinks must not click. Clicks can also be suppressed during fast cursor movement or speech. A closure held beyond the permitted maximum is rejected. Pause remains available in every mode and stops listening; start listening again after resuming.

## Voice, dictation and GenAI

### Start local speech

Under **Local speech**, choose **Start listening** and wait for **Microphone live**. Gaze-only mode must be off. Basic local recognition does not require an LLM API key.

Try commands such as “scroll down”, “right click” or “dictation on”. Dictation adds recognized text to a proposal; it does not immediately type it. Review the card and explicitly confirm before insertion. Use the phrase palette for non-voice equivalents.

### Configure OpenRouter

Create a file named `.env` at the repository root:

```dotenv
OPENROUTER_API_KEY=your-key-here
OPENROUTER_MODEL=openai/gpt-4.1-mini
```

The model shown is the project's configurable default, not a guarantee of provider availability or quality. Restart `pnpm dev` after changing the file. The development main process reads these values; shell environment values take precedence. Keep the key private: `.env` is gitignored, and it must never be placed in renderer variables or screenshots. Packaged-app credential setup remains a follow-up.

Only allowlisted provider requests are permitted. Cloud generation can incur provider charges and sends the limited text context needed for the request; camera and microphone media remain local. See [OpenRouter setup](docs/openrouter-setup.md).

### Generate text in another app

1. Focus a supported editable, non-password field and select the text to transform.
2. Say “rewrite this formally” / 「幫我改正式啲」, “translate to English” / 「譯做英文」, or “write a reply saying I can attend”. Requests can also be composed through the palette.
3. Review the proposal, correct it if needed, then confirm. Keep the intended destination field selected while using the overlay or hotkey.
4. Cancel leaves the field untouched. “Undo that” starts the protected undo flow for the recent insertion in the same app/window.

The 書面語 / 口語 toggle requests another version. For an English translation, 口語 switches to colloquial Cantonese; 書面語 restores the original English request. Unsupported field APIs fail closed. Gestura does not send the reply or execute generated code.

### Excel integration

Excel generation requires the Office.js add-in and authenticated local bridge, in addition to the LLM configuration. Select the destination cell, connect the add-in, request a formula, review the proposal and referenced ranges, then confirm.

```sh
pnpm excel:build
```

The repository also provides `pnpm excel:dev` and `pnpm excel:sideload` helpers, but **those helpers currently use macOS-specific paths**. Excel setup includes trusting a local HTTPS certificate and sideloading the add-in; Windows needs the corresponding manual setup. Follow the [Excel bridge decision](docs/decisions/0012-excel-bridge.md) and [provider setup guide](docs/openrouter-setup.md). Live compatibility checks are still required.

### VS Code integration

```sh
pnpm vscode:build
pnpm dev
```

In another terminal from the repository root:

```sh
code --extensionDevelopmentPath=./integrations/vscode/dist
```

Check for **Gestura: connected**. Use a trusted local workspace. A code proposal opens a read-only diff; fresh confirmation applies a `WorkspaceEdit`, without executing or saving the code. Context is limited to language, file name, selection and up to 40 surrounding lines. See the [extension README](integrations/vscode/README.md) for pairing, correction and undo details. Never share the pairing token file.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Only the UI or an overlay ring moves | Use the desktop app, build the native addon, finish calibration, resume input and enable pointer control. Check macOS Accessibility permission. |
| Cannot reach the top or bottom of the screen | Recalibrate the comfortable range of motion. Gaze jumps start off and need their own calibration. |
| Blink or wink does nothing | Select **Use blink / right wink**, then inspect **Blink feedback**: eye states, duration, thresholds and rejection reason. Reopen after the gesture. |
| An open eye is reported closed | Recalibrate in steady lighting. Per-eye detection reliability is still a known limitation; use dwell as an alternative. |
| “Sent to native input” but no visible click | This records a native call, not confirmed OS delivery. Check permissions and test a harmless target outside the Gestura controls. |
| “Speech unavailable” immediately | Run `pnpm models:fetch`, restart the app, resume input and retry listening. Check microphone permission and terminal speech-worker errors. |
| No microphone response | Wait for **Microphone live**, turn gaze-only mode off, and remember pause stops listening. |
| `Error: Electron uninstall` | The Electron package may exist without its downloaded executable. Check installation output and permitted Electron build scripts; complete the project's Electron installation before restarting. |
| GenAI does not respond | Check the root `.env`, restart the app, and check provider/model availability and the relevant integration connection. Never post the API key when sharing errors. |

Live eye-gesture reliability and system-wide input delivery remain manual acceptance tasks. Synthetic tests cannot resolve an individual camera or OS permission issue.

## Privacy and user control

- Camera and microphone media stay on the computer and are not written to disk by the capture pipelines.
- Tracking and speech recognition use local model files, with no runtime model CDN.
- GenAI requests use restricted text context. Excel and VS Code connections use authenticated local bridges.
- No telemetry, analytics SDKs, uploaded crash reports or collection of user data for training.
- Logs and benchmark reports are local, opt-in and user-deletable.
- Generated text, formulas, code and dictation require fresh confirmation through `ActionGate`. Click gestures cannot authorize them.

Gestura is not a medical device and makes no medical claims. Privacy design choices are not a claim of legal certification.

## Intended impact and evaluation

Gestura aims to reduce repetitive physical input, make Cantonese and mixed-language desktop tasks more accessible, and let users review generated content before it changes their work. The benefit depends on reliable voluntary head/eye control, calibration and application compatibility.

These are **project targets**, not demonstrated product-wide results:

| Area | Target |
| --- | --- |
| Pointing | At least 85% hit rate, under 5% false clicks, cursor latency below 100 ms at p95. |
| Effort | Hypotheses: at least 60% fewer physical input actions and 40% less task time versus head mouse plus on-screen keyboard. |
| Formula quality | At least 80% correct first try and 95% after one correction. |
| Voice | At least 90% correct intent recognition on scripted Cantonese, English and mixed commands. |
| Onboarding | Setup and calibration below two minutes; SUS score at least 68. |

See [progress](docs/PROGRESS.md) and [benchmark report notes](docs/benchmarks/README.md). Checked-in formula reports include mock and transport-smoke runs; they do not establish real-provider formula accuracy. Human recordings, real task studies and cross-platform acceptance must be reported separately from synthetic fixture results.

## Development and benchmarks

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the desktop development app. |
| `pnpm verify` | Lint, workspace typechecks and tests. |
| `pnpm test` | Unit and fixture tests. |
| `pnpm native:build` | Build the current platform's native addon. |
| `pnpm native:ui-probe` | Inspect nearby accessible controls locally. |
| `pnpm native:bench` | Measure native cursor-call latency. |
| `pnpm bench:pointing` | Open the local pointing benchmark with optional reports. |
| `pnpm bench:voice` | Evaluate text-to-intent matching. |
| `pnpm bench:voice:asr` | Evaluate local ASR samples; models required. |
| `pnpm bench:formula` | Evaluate formula cases; configure mock/live mode explicitly. |

Some native tools move the actual cursor. Read their instructions before running them. The native demo's text-insertion path remains gated by the permitted confirmation mechanisms.

Benchmark details: [pointing](tools/pointing-bench/README.md), [voice](tools/voice-bench/README.md), [formulas](tools/formula-bench/README.md).

### Repository structure

```text
apps/desktop/           Electron main, preload, control/overlay/vision and speech
packages/core/          Shared types, configuration and zod schemas
packages/pointer/       Pure head/gaze, filtering, calibration and snapping logic
packages/gestures/      Pure eye and mouth state machines
packages/intent/        Command grammar and matching
packages/genai/         Provider interface, prompts and response validation
native/gestura-native/  Rust input and accessibility queries for macOS/Windows
integrations/           Excel add-in and VS Code extension
tools/                  Replay and pointing/voice/formula benchmarks
fixtures/               Derived landmark and evaluation fixtures
models/                 Local model downloads, excluded from Git
docs/                   Progress, open questions, decisions and benchmark reports
```

Read [AGENTS.md](AGENTS.md), [progress](docs/PROGRESS.md) and [open questions](docs/open-questions.md) before contributing. Keep generated assets, model files, credentials and build outputs out of commits. Follow the repository's confirmation, privacy and pause rules.

## Licensing

A project-wide license has not yet been declared in this repository. Check dependency and model licenses before redistribution. In particular, the formula benchmark uses HyperFormula, which is available under GPLv3 or a commercial license; see the [formula benchmark documentation](tools/formula-bench/README.md).
