# 0013: Formula proposal, confirmation, correction and restore

Date: 2026-10-17. Step: P4.3.

## Decision

`main/formula/FormulaController` owns the formula state machine. Generation runs outside
InputController's serial input queue. Cancel and pause revoke the proposal immediately,
abort the provider request and ignore results from older generations. Correction revokes
the previous ActionGate proposal before awaiting anything; the next request carries the
original request, previous formula and correction as bounded history. The original Excel
context is retained. The provider gets the request language, with Traditional Hong Kong
Chinese requested for Cantonese/mixed requests.

The overlay shows thinking, clarification, proposal, correction number, write/restore and
error states. A matching cached spreadsheet-cell AX/UIA rectangle anchors the card; if
none exists, it uses a primary-display-clamped fallback. Referenced columns are selected
through the existing bridge, within the used range. Selection failure is disclosed on the
card and never triggers a write. Native coordinates are converted to overlay CSS units
(points directly; DPI-aware pixel coordinates divided by display scale).

Formula text uses large local monospace. Full formulas, explanations and previous cell
contents are paged, with 64 px Back/Next targets. Pages are cached outside pointer math.
Only after the final page paints does overlay send its proposal ID; main records the
presentation time. A fresh ASR onset after this timestamp, or a silent fresh one-second
mouth hold, can consume the ActionGate token. Main resets the mouth state at each new
proposal and presentation. Blink/wink clicks on the card are consumed without activating
its controls. Explicit dwell can review, correct, cancel or stage undo, never confirm.
The control window mirrors review actions for keyboard access; the actual overlay remains
unfocusable and click-through. Global pause cancels pending work in every state.

## Bound writes and exact-once handling

Only one add-in may be connected. Context includes a connection-local session UUID and
worksheet ID. Before presenting a formula, prepareCell snapshots the destination's raw
formula or primitive value in add-in memory. The token, session, sheet, target and before
content are sealed into the ActionGate proposal. Main rechecks foreground app/window at
confirmation. Add-in commit rechecks active sheet, session, snapshot age/content and the
current cell against the before content. It reserves the snapshot before awaiting Office.
Repeated command IDs are deduplicated; an ActionGate confirmation and a snapshot can each
be consumed only once. A changed connection revision invalidates pending replies.

A failed/ambiguous write is never automatically retried. The UI asks the human to inspect
Excel. A sent Office mutation cannot be recalled after it has reached Excel; pause/cancel
prevent subsequent sends and discard late results. This is not a transaction spanning
Excel coauthors: comparison and write use separate Office sync operations, so a concurrent
external edit between them remains a host limitation. Do not treat these checks as a
cross-client compare-and-swap guarantee.

## Undo decision

The existing bridge ADR is `0012-excel-bridge.md`, not the requested `0005-excel-bridge.md`;
0005 documents the pointer pipeline. Desktop Ctrl+Z behavior is still unverified. Use a
local snapshot fallback, rather than assuming an unmeasured undo stack behavior.

After a successful acknowledged write, a new excel-restore action is proposed. Trusted
"undo that" can confirm it only after the prior content has been reviewed/presented and
with a fresh ASR onset. The gaze Undo tile stages a restore card requiring voice/mouth
confirmation. Restore rechecks the current cell still contains exactly the written
formula; otherwise it refuses to overwrite the user's intervening edit. Snapshots live
only in memory, expire after 60 seconds (renewed on successful commit), and are cleared on
reconnect. No previous cell content is included in provider context or logs.

Safe primitive restore uses `valuesAsJson` with explicit String/Double/Boolean/Empty types,
so literal text beginning with '=' stays text. It requires ExcelApi 1.16. Rich/error values
are rejected before proposal. Discontiguous range selection requires ExcelApi 1.18 and
otherwise displays an unavailable-selection note. No new dependency or runtime network
route is added. @gestura/genai is bundled into Electron main because its workspace export
points to TypeScript source.

## Sources checked

- [Office.js undo capabilities](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/excel-add-ins-undo-capabilities): supported operations and undo grouping; not a desktop-host test.
- [StringCellValue](https://learn.microsoft.com/en-us/javascript/api/excel/excel.stringcellvalue?view=excel-js-preview): explicit type and basicValue, ExcelApi 1.16.
- [RangeAreas.select](https://learn.microsoft.com/en-us/javascript/api/excel/excel.rangeareas?view=excel-js-preview): ExcelApi 1.18 for discontiguous selection.
- [Range](https://learn.microsoft.com/en-us/javascript/api/excel/excel.range?view=office-js): formulas, valuesAsJson and special cell queries.

## Verification limits

Automated tests use MockProvider-style scripted responses, fake native input, fake Office
objects and loopback bridge clients. No real workbook, microphone, camera, remote provider
or Windows host was exercised. Desktop Excel on both platforms must still verify Ctrl+Z,
reference selection, literal-value restore, permission behavior and focus preservation.
