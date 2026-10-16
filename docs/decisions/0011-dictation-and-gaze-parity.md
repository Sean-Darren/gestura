# 0011: Confirmed dictation and gaze-only commands

Date: 2026-10-16. Step: P3.3.

## Decision

InputController in main owns command dispatch, transient drafts, presentation acknowledgement,
destination checks, palette hit testing and text confirmation. Renderers receive validated
state and may select only currently visible actions. No IPC operation accepts confirmation
evidence. Only trusted ASR onset or the main-side live mouth-hold state machine confirms text.

Q4, Q10, Q11 and Q12 apply: held jaw toggles listening, dictation requires confirmation,
confirmation uses voice or a fresh one-second mouth hold with a visible countdown, and
spoken Cantonese text is preserved. Click gestures never confirm. With a proposal pending,
the mouth gesture confirms instead of toggling listening. A fresh closed-mouth observation
is required after presentation, replacement, tracking loss or a hold interruption.

Each final dictation segment appends to the current dictation draft. Revisions revoke the
previous ActionGate proposal and clear presentation/hold state. Proposal text is bound to
the content hash; expiry remains 60 seconds. The overlay acknowledges presentation after
two animation frames. Long text has bounded review pages; the final review page must be
presented before confirmation. Main stamps the presentation time; a renderer cannot supply
a speech timestamp. Voice must start strictly after that time.

NativeBridge accepts minted, matching, single-use confirmations for kind `dictation` as
well as existing `type-text`. Destination app ID and window title are captured and checked
again before typing. Pause cancels proposals, stops speech and aborts chunked typing.
Display changes cancel proposals. Overlay loss/reload during speech or insertion pauses
input; microphone startup requires a ready, visible overlay.

## Palette and input

The overlay remains unfocusable and click-through. Main derives tile bounds and consumes
head/blink/dwell selections before native clicks. The same bounds are excluded from target
snapping. Fixed tile dwell also operates during drag mode so drag-off remains reachable.
Clicks/double-clicks selected in the palette are armed for the next external target, avoiding
an accidental click at the palette's previous location. Voice clicks with the palette hidden
use the current pointer and existing snapping path.

Tiles are at least 64 px. Small layouts use three columns, with separate pause space and
reserved footer space. The control window mirrors palette controls for keyboard access and
has a Unicode draft field. A paged character composer supports letters, numbers, punctuation
and reuse of configured phrases. It is not a new Cantonese input method editor.

The default palette has no personal phrases. Explicitly saved phrases and gaze-only settings
are stored in `userData/palette.json`; transient transcripts, proposals and clipboard snapshots
are never saved. Phrases can be edited and removed. Clipboard paste reads an exact plain-text
snapshot into a proposal; it does not invoke an unreviewed paste shortcut.

Listening shortcut: Control+Alt+L on both OSes (Option is Alt on macOS). The existing pause
shortcut remains Control+Alt+P. Shortcut failure is reported, with dwell and mouth alternatives.
Gaze-only mode immediately stops speech, invalidates pending capture generations, blocks all
restart paths and never auto-starts the microphone when turned off.

## Coverage and limitations

Every P3.2 intent has a registered non-voice route. Confirmation uses the mouth hold;
resume uses the existing pause corner. Dictation-on in gaze-only mode opens text composition.
Range and formula requests have composers and honest unavailable messages: Office.js
navigation is P4.1 and provider execution is P4.2. No mock execution is presented as real.

Undo-that sends the destination app's primary+Z only for the last completed Gestura insertion,
within 15 seconds, in the same app/window, with no intervening Gestura input. It is single-use.
This cannot prove the native editor's undo grouping or observe physical keyboard/mouse edits.
Do not use it after unrelated physical edits. Exact editor transactions require integration
support; check behavior in each supported destination app. Partial insertion after pause is
reported and does not create an undo record. No real-editor undo success is claimed here.

With microphone off, mouth recognition uses visual closure and stable jaw opening. With a
live microphone, explicit VAD silence is required. Synthetic talking replay is covered;
real-user false-trigger rates and sustained vowel behavior still require manual checks.

## Sources checked

- [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut): global listening shortcut.
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window): `focusable`, `showInactive`, visibility and lifecycle.
- [Electron clipboard](https://www.electronjs.org/docs/latest/api/clipboard): asynchronous main-process `readText()`.
- [Microsoft featured Excel functions](https://support.microsoft.com/en-us/excel/excel-functions-by-category): SUM, IF, SUMIFS, XLOOKUP, COUNTIFS, COUNT, LET, FILTER, UNIQUE and TEXTBEFORE.

Microsoft labels these ten as featured, not a measured popularity ranking. The palette inserts
function starters as text requiring confirmation, without evaluating formulas or appending Enter.

No new third-party package: desktop now links the existing workspace intent package, bundled
into main. React, Electron and native input interfaces continue to support both target OSes;
Windows execution remains a teammate manual check.
