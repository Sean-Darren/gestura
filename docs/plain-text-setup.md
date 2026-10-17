# GenAI for selected text fields

## Start

Quit the existing Gestura instance, then run:

```sh
pnpm native:build
pnpm dev
```

Use your existing root `.env` provider settings (see
[OpenRouter setup](openrouter-setup.md)). This step adds no model downloads,
new dependencies, commands or workflows. Generating a proposal can incur a
provider charge; app startup alone does not generate one.

macOS requires Accessibility permission. Windows uses the existing UI Automation
COM thread. A field must expose focused, enabled, editable, non-password text
selection APIs; the feature refuses unsupported/read-only/password controls.
Windows currently requires both TextPattern and writable ValuePattern; macOS
requires selected text/ranges and writable value/selection attributes. Known
terminal/command hosts and VS Code are excluded from this plain-text route;
use the dedicated code integration for VS Code. There is no clipboard or full
field-value fallback.

## Rewrite, reply or translate

1. Focus a disposable text field (for example TextEdit in plain-text mode or
   Notepad). Select the text to transform using the existing drag controls or
   your usual input method. Leave that field focused and use the overlay.
2. Say one of the commands below, or choose its palette tile. Gaze-only mode
   keeps the microphone off. For a reply, use **Write a reply**, compose the
   instruction and dwell on **Use draft**. Reply drafting permits an empty
   selection; rewrite and translation require selected text.

   | Action | English | Cantonese |
   | --- | --- | --- |
   | Formal rewrite | rewrite this formally | 幫我改正式啲 |
   | Reply | write a reply saying I can attend | 幫我覆佢話我可以出席 |
   | English translation | translate to English | 譯做英文 |
   | Chinese translation | translate to Chinese | 譯做中文 |

3. Review every text/explanation page on the proposal card. **書面語 · 改用口語**
   requests colloquial Cantonese from the original selection; switching back
   restores the original written-language request. In particular, an English
   translation changes to Cantonese on 口語 and returns to English on 書面語.
   Toggling never types and invalidates the prior confirmation.
4. After review, say **confirm / 確認**, or close your mouth then hold it open
   silently for one second. Blink, wink and dwell never confirm. The confirmed
   text replaces the selected text, or inserts at an empty selection.
5. **Cancel** before confirmation leaves the field text and selection unchanged.
   Global pause cancels the proposal and stops later injection chunks. An edit
   already delivered to the OS cannot be recalled; an interrupted insertion may
   be partial. Check the field before requesting another edit.
6. **Undo that** stages a separate proposal. Review and confirm it to remove
   only the recorded insertion, restoring the original selected text when it
   was replaced. This uses a verified selection and typed replacement, not a
   broad Ctrl+Z or a guessed number of Backspaces. If a field/range cannot be
   verified, undo is refused.

Gestura does not press Enter, click Send or automatically submit the field.
Only literal Unicode text is injected; the sole removal key is one Backspace
on the verified insertion selection during separately confirmed undo. No shell,
terminal, tasks, debugger or generated-code execution API is used.

## Limits and checks

- Context and action snapshots are in memory. A native target snapshot expires
  after 60 seconds from capture, including generation/review time. A proposal
  also expires after 60 seconds. No selected text, model response or field
  receipt is logged or persisted by this feature.
- Native checks bind the focused control and selection. After each insertion
  chunk, only the newly inserted range is read to verify it, allowing CRLF/LF
  normalization. The full field is never read. A focus/range mismatch stops
  subsequent chunks and disables automatic undo after an uncertain result.
- Accessibility providers differ, especially browsers, rich text editors and
  IME composition. No universal atomic transaction or editing-version API exists
  for arbitrary fields. Verify supported applications on both OSes; known
  command hosts are excluded, but process-name filtering is not a security
  sandbox against arbitrary applications or other same-user software.
- Do not assume an unknown failure means no characters were inserted. Check the
  destination; Gestura does not automatically retry an insertion.

## Manual acceptance on macOS and Windows

- Select English/Cantonese text. Verify rewrite, both translations and a reply
  with empty/nonempty selection. Include Chinese, emoji, line breaks and
  `= ( ) : $` in a disposable field.
- Verify original selection remains unchanged throughout generation, register
  changes and cancellation. Inspect the complete paginated card at narrow width
  and short display scaling; all review/register/cancel controls must remain
  visible and reachable by dwell.
- Verify register round-trip uses the original selection, never the generated
  result as new source. Test the English → Cantonese → English behavior.
- Confirm by fresh voice and silent mouth hold; blink/wink/dwell must never type.
  Confirm twice rapidly and check only one insertion. Test gaze-only mode with
  mic off, request/review/register/cancel and staged undo.
- Change field, selection or focus before confirmation/undo; expire a snapshot;
  pause during generation/review/insertion. Verify refusal or a disclosed
  partial outcome, without any later automatic injection.
- Confirm Undo restores a replaced selection, or removes an insertion at the
  empty caret. Test Unicode and line endings. Change the insertion range before
  Undo and verify it refuses to overwrite unrelated text.
- Try read-only, password and unsupported fields, plus a terminal/VS Code field:
  no provider request or text injection should occur through this feature.

Automated tests use MockProvider, scripted native fields and synthetic landmarks.
No live provider, camera, microphone or OS field was used. The browser approval
gate declined the local scripted visual preview, so visual verification remains
manual. The temporary preview server was stopped after that denial.
