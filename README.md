# Gestura


An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Platform Support

Gestura targets both macOS and Windows 11:

| Area | macOS | Windows 11 |
| --- | --- | --- |
| Camera, local face tracking, speech, pause | Supported | Supported |
| Head pointer and gaze features | Supported with Accessibility permission | Supported with native input permission |
| VS Code bridge | Supported with macOS native pairing helper | Supported with Windows owner-only pairing helper |
| Excel bridge | Supported with Office.js and trusted localhost certificate | Supported with Office.js and trusted localhost certificate |
| Native build | Build the macOS addon locally | Build the MSVC addon locally |

The shared TypeScript application and both integrations are the same on each
platform. Only OS-level input, UI queries, permissions, pairing protection, and
Excel certificate/sideload steps vary.

## Setup

Requirements:

- macOS or Windows 11
- Node.js 22 or newer
- Microsoft Excel desktop and VS Code for the integrations
- Rustup and the platform's native build tools

Install the native build prerequisites for your platform, restart the terminal,
and run the shared setup commands:

```sh
corepack enable
corepack pnpm install
corepack pnpm models:fetch
corepack pnpm native:build
corepack pnpm vscode:build
corepack pnpm excel:build
```

`models:fetch` downloads the local face-tracking and speech assets. The native
build is required for OS input, permissions, UI queries, and VS Code pairing.

Platform-specific prerequisites:

- macOS: Xcode Command Line Tools and the macOS Rust target.
- Windows: Rust's MSVC toolchain and Visual Studio's Desktop development with
	C++ workload.

## Run Gestura

Start the desktop app from the repository root:

```sh
corepack pnpm dev
```

Keep this process running while using the integrations. The control window
shows camera, speech, pause, and integration status.

## VS Code Features

The VS Code integration supports:

- Local trusted files and untitled documents; remote workspaces, Codespaces,
	notebooks, and custom editors are not supported.
- Bounded context from the active editor: language, filename, selected text,
	and nearby lines only. It does not scan the workspace.
- Code requests, formula-like code requests, corrections, bilingual
	explanations, read-only beside diffs, cancellation, and staged undo.
- One confirmed WorkspaceEdit after review. It never runs code, opens a
	terminal, starts tasks/debugging, saves automatically, or sends messages.
- Voice confirmation or a fresh held-mouth confirmation. Blink, wink, and
	dwell cannot confirm an edit.

The workflow is the same on macOS and Windows. The native pairing helper uses
macOS file permissions or a Windows owner-only ACL.

In a second terminal, open a development VS Code window with the bundled
extension:

```sh
code --extensionDevelopmentPath="./integrations/vscode/dist"
```

Open a trusted local code file. The status bar should show `Gestura: connected`.
Use the Gestura palette to request code, review the read-only diff, and confirm
by voice or held-mouth gesture. Gestura never runs, saves, or sends generated
code automatically. See [the VS Code guide](integrations/vscode/README.md).

## Excel Features

The Excel integration supports:

- Office.js task-pane connection over a token-paired localhost WebSocket.
- Reading the active sheet's bounded context: headers, addresses, inferred
	column types, and up to five sample values per column only when explicitly
	enabled.
- Formula requests, formula validation, provider fallback for supported
	single-function formulas, range selection, clarification, correction, and
	guarded restore.
- A single confirmation-gated formula write. Selection changes do not write;
	generated formulas never execute arbitrary code.
- English and Traditional Hong Kong Chinese explanations through the existing
	formula review flow.

It does not support arbitrary workbook automation, macros, VBA, sending email,
or unconfirmed writes. The workflow is the same on macOS and Windows, but each
machine must trust the localhost certificate and sideload the manifest using
its own Excel installation.

Build and trust the local add-in certificate, then sideload
`integrations/excel-addin/manifest.xml` in desktop Excel using **My Add-ins** or
the Office Add-in debugging workflow. The task pane must load from
`https://localhost:3510` and show a connection to Gestura. Enable the Excel
bridge in the desktop app configuration before starting Gestura. Certificate
trust and sideloading follow the standard Office.js process for the host OS.

Select a disposable cell or range, request a formula, review the explanation,
and confirm by voice or held-mouth gesture. Range selection does not write;
formula insertion is single-use and confirmation-gated. Keep sample values
disabled unless you explicitly want them shared with the configured provider.

### Build

```sh
corepack pnpm verify
corepack pnpm --filter @gestura/desktop exec electron-vite build
```

The native addon must be built on each target platform. Complete runtime checks
for permissions, camera, speech, VS Code pairing, and Excel sideloading before
treating an integration as production ready.
