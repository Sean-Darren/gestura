# 0015 — Local VS Code code proposals

Date: 2026-10-18. Status: implemented; real editor/Windows acceptance checks pending.

## Decision

Use a desktop extension host with a token-paired loopback WebSocket. Reuse the
existing `ws`, `esbuild` and Zod ecosystem; add development-only VS Code API
signatures. These dependencies support both macOS and Windows. No additional
runtime UI framework or network service is introduced.

The pnpm workspace remains `@gestura/vscode`. Build emits a bundled CommonJS
extension plus an unscoped VS Code manifest under `integrations/vscode/dist`.
API usage follows the [VS Code API](https://code.visualstudio.com/api/references/vscode-api)
for virtual document providers, `vscode.diff`, WorkspaceEdit and applyEdit.
Both diff sides are read-only virtual documents; the original editor remains
visible in its group. Status text is informational; the existing overlay
provides the large dwell controls. No new small extension button is needed.

Main rotates a token and atomically publishes a validated pairing file under
the OS home directory. macOS mode bits and Windows protected user-only DACLs
are implemented under the existing native platform folders. Failure to secure
the directory disables this bridge. The token is an OS-user boundary, not
protection against other processes owned by that user or a privileged OS admin.

The server accepts one local extension, bearer authentication, no browser
Origin, no compression and bounded messages. Commands/events use strict core
Zod schemas. Connection revision, snapshot and preview IDs bind each edit.
`ConfirmedAction` stays inside main and is checked with the existing private
brand before the bridge sends a single-use apply command. A wire object is
never cast into a branded action. Apply commands contain IDs, not new code or
paths: the extension applies only the previously previewed replacement.

The provider receives exactly the approved code equivalent of Q15, documented
in open-questions.md. An opaque snapshot binds a local URI, document version,
selection, cursor and original text. One million characters is the local
snapshot/preview bound; provider context is much smaller. Nothing is scanned,
automatically saved or executed. The cloud provider remains main-only through
the exact-host transport and existing OpenRouter privacy routing.

Code generation uses structured JSON, validates bilingual explanations, status,
code and insertion mode, and repairs an invalid response once within the total
timeout. Corrections retain at most 20 user/code history messages. Invalid
responses never reach a preview or ActionGate.

Review uses the existing paginated proposal card and silent one-second mouth
hold / fresh voice evidence. Changing or cancelling a proposal revokes its
ActionGate ID. Pause cancels generation and previews, resets editor transactions
and invalidates undo. No blink/wink/dwell confirmation path is added.

Undo uses an independently previewed and confirmed WorkspaceEdit restoring
exact previous document text only while the current local snapshot/version/
selection still matches. It never sends the entire document to main/provider.
A newer edit, reconnect or expiry fails closed. Once applyEdit has accepted an
edit, pause cannot recall it. Other extensions may react to editor changes;
no cross-extension transactional isolation is claimed. Uncertain acknowledgements
are not retried automatically.

ESLint forbids child_process, VS Code terminal/tasks/debug APIs, dynamic import /
require escape paths and arbitrary executeCommand calls in the integration.
Only the literal `vscode.diff` preview command is permitted. This is a development
boundary, not a sandbox against deliberately obfuscated third-party code.

## UI direction

Antislop during implementation; existing light green/system-font style, energy
1 / rhythm 1 / motion 1. The code/diff is the focal point. Reusing card layout,
review pagination, 64px dwell controls and confirmation ring keeps the existing
interaction consistent. Only labels change between formula and code review.

## Evidence and remaining checks

Automated tests exercise schemas, bounded context, generation repair/correction,
private token publication, loopback pairing, minted capability checks, replayed
commands, expiry, destination changes, pause and independent undo. A real native
macOS permission smoke and Clippy for macOS/Windows targets are run separately.
Runtime acceptance in actual VS Code, Windows ACL enforcement, real ASR/mouth
input and provider quality remain manual checks; see integration README and
PROGRESS.md. The maintainer supplied Phase 4's gate decision.
