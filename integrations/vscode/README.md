# Gestura for desktop VS Code

## Run locally

Quit any running Gestura instance first. From the repository root:

```sh
pnpm install
pnpm native:build
pnpm vscode:build
pnpm dev
```

In another terminal, launch a VS Code development window with the built extension:

```sh
code --extensionDevelopmentPath=./integrations/vscode/dist
```

If your Code CLI needs an absolute path, use the absolute path of that `dist`
folder. The extension's loadable manifest is in `dist/package.json`; the parent
manifest is the scoped pnpm workspace package. No Marketplace publishing or
installation is performed by the build.

Open a trusted, local disposable code file. The status bar should say
“Gestura: connected”. The extension retries pairing every three seconds;
“Gestura: Connect to Desktop” in the command palette reconnects immediately.
Remote/Codespaces and untrusted workspaces are not supported by this step.

Configure the provider using the root `.env` as described in
[OpenRouter setup](../../docs/openrouter-setup.md). The extension never reads
that key and never contacts a provider itself.

## Request, review, correct and undo

1. Keep the intended source editor visible. Select the code to replace, or
   place the cursor where new code should go.
2. In Gestura's overlay palette, choose **Code request**, compose a request,
   and dwell on **Use draft**. With listening on, an unmatched utterance in
   VS Code also becomes a code request; explicit “formula …” requests are
   routed to code while VS Code is foreground.
3. Read the VS Code diff in the beside editor and every page of the Gestura
   proposal card. Nothing has been inserted yet. Both diff sides are virtual,
   read-only documents.
4. Say “confirm” / 「確認」 after review, or close your mouth then hold it open
   silently for one second. Blink, wink and dwell cannot confirm. A successful
   confirmation applies one WorkspaceEdit to the source document; it does not
   save or execute it.
5. Speak a correction, or dwell on **Correct**, compose it and choose **Use
   draft**. The old proposal is invalidated; review and confirmation start again.
6. **Undo that**, by voice or dwell, opens a fresh inverse-edit diff and card.
   Review and confirm again. Changed documents or selections are rejected.
7. **Cancel**, global pause and the pause corner remain available. Gaze-only
   mode keeps the mic off; request/correction composition, review, cancellation
   and undo use dwell, while confirmation uses the silent mouth hold.

Proposals expire after 60 seconds. Context snapshots also expire after 60
seconds, including inference and review time. Changing the source document,
version, selection, cursor, destination window or connection requires a fresh
request. If an acknowledgement is lost, inspect the document before retrying:
Gestura never automatically retries an edit. Pause can stop unsent edits but
cannot recall an edit already accepted by VS Code.

## Pairing and context

Gestura writes `~/.gestura-vscode/pairing.json` on startup with an ephemeral
loopback port and a rotating token. It uses a 0700 directory / 0600 file on
macOS. On Windows, a native helper installs a protected DACL granting only the
current user inherited full access before the new token file is written. If
protection fails, the bridge stays unavailable. Rebuild the native addon after
updating. A crash may leave a stale token file; the next startup replaces it.
Normal shutdown attempts to remove it. Do not share the file.

The extension connects only to `127.0.0.1`, with no redirects. The server
rejects browser Origins, wrong credentials and additional clients. Pairing is
an OS-user boundary; other applications running as the same user are not
isolated from this token.

Provider context is limited to language, filename basename, selected text and
40 surrounding lines. Selected text and surrounding lines are each bounded
to 16,000 characters. Larger inputs fail closed. There is no workspace scan.
The extension keeps at most one bounded (one million characters) document
snapshot and undo receipt in memory; complete documents never cross the bridge.
The preview provider holds only the current before/after pair; VS Code may
retain opened virtual documents in its own editor cache until those tabs close.
No source, token or provider response is logged to disk by this integration.

## Manual checks on macOS and Windows

- Verify pairing, reconnect after restarting Gestura, and wrong-token rejection.
  Inspect owner-only file access (including `icacls` on Windows).
- Test empty and non-empty selections, Unicode code, both insertion modes,
  English/Cantonese explanations and a validation retry with a mocked provider.
- Verify the diff opens beside the source, leaves it visible, and is read-only.
  Check the complete code and explanation fit paginated overlay review.
- Verify voice/mouth confirm writes once; blink/wink/dwell do not. Exercise
  gaze-only request, correction, cancel and staged undo.
- Edit/move selection/switch files/disconnect/wait over 60 seconds before
  confirmation. Verify no write. Change the document after insertion and
  verify undo refuses to overwrite it.
- Pause during generation, preview, confirmation and undo. Verify no later
  result opens a new proposal and no unsent edit proceeds.
- Inspect the changed document and its normal VS Code undo stack. No terminal,
  tasks, debugger, shell process, code execution or automatic save should occur.
