# 0003: UI element query coverage

Date: 2026-10-14
Status: implemented; live coverage and latency measurements pending

## Contract

The native addon exposes Promise-returning `elementAt(x, y)` (element or null),
`elementsNear(x, y, radiusPx)` (at most 50 elements), and `foregroundApp()`.
Only copied bounds, common role, accessible name, enabled/offscreen flags, and
semantic clickability cross the native boundary. Queries never invoke controls,
read their value/text patterns, or inject input. Accessible names and window
captions can contain personal information; they stay in memory. The explicitly
invoked probe prints them only to its local terminal and writes no log files.

`packages/core/src/ui-elements.ts` defines the shared role enum and strict schemas.
`isClickable` denotes a recognized interactive role, independently of
`isEnabled`; future snapping must also exclude disabled and offscreen elements.
Unsupported roles and invalid/zero-size rectangles are omitted. Names are capped
at 4,096 characters. Custom drawn controls may expose no usable accessibility
information. Table/grid cells cannot reliably be distinguished from spreadsheet
cells, so the shared spreadsheet-cell role covers accessible grid cells.

| Shared role | macOS AX | Windows UIA |
| --- | --- | --- |
| button | AXButton, AXPopUpButton, AXMenuButton | Button |
| link | AXLink | Hyperlink |
| menu-item | AXMenuItem, AXMenuBarItem | MenuItem |
| tab | AXTabButton subrole; AXRadioButton in AXTabGroup | TabItem |
| list-item | AXRow | ListItem |
| check-box | AXCheckBox | CheckBox |
| edit-field | AXTextField, AXTextArea, AXComboBox | Edit, ComboBox |
| spreadsheet-cell | AXCell | DataItem with cached GridItem pattern |

## Threads and traversal

A single named Rust worker initializes and owns AX/UIA objects. napi-rs AsyncTask
compute workers send bounded requests and wait off the JavaScript thread. The
queue holds at most one waiting request; busy workers reject additional requests.
Expired queued requests are skipped. Only plain owned data crosses threads.

macOS uses AXUIElementCopyElementAtPosition, climbs at most eight ancestors when
the hit is a label, then walks nearby siblings and descendants. AX messaging uses
a 10 ms timeout. CF objects are retained/released on the worker. Accessibility
permission comes from P1.1 and is checked on every operation. AX offscreen status
is approximated from active display intersection, AXHidden when available, and
AXWindow/AXMinimized; clipping or obscuring by other windows is not detected.
Foreground identity comes from the focused AX application PID and its bundle ID;
non-bundled processes yield an explicit error rather than a fabricated bundle ID.

Windows initializes COM in MTA mode on that worker and releases interfaces before
CoUninitialize. A cache request fetches bounds, role, name, enabled, offscreen,
and GridItem pattern data during hit-testing/tree walking. Control-view traversal
uses BuildCache methods. Foreground identity is the process filename (including
.exe); window title comes from GetWindowTextW. Elevated apps can require an
appropriately privileged host; there is no privilege escalation in this addon.

Traversal stops at 200 visited nodes, 50 returned controls, or a 15 ms soft
budget. This favors nearby coverage over whole-app enumeration. Provider calls
already in flight can overrun the budget. The native wait and wrapper deadline
are 250 ms by default; a hung UIA provider can keep the dedicated worker occupied
while JavaScript stays responsive. Timeouts do not kill foreign provider calls
or create replacement threads. Relaunch the host if that worker remains stuck.

## Coordinates and cache

Coordinates and returned bounds use the P1.1 contract: Quartz points on macOS,
physical DPI-aware pixels on Windows (per-monitor-v2 thread scope). `radiusPx`
is always physical pixels. On macOS it is divided by the query display's scale
factor; Windows uses it directly. Negative desktop origins are valid. Q6's
primary-display MVP default applies to manual checks; mixed-scale cross-display
radius behavior needs separate coverage before multi-monitor support.

The main-process wrapper owns an immutable latest-result snapshot. It validates
all arguments/results, checks foreground identity before and after querying,
and ignores responses superseded by another query, timeout, pause, or disposal.
Cache reads are synchronous and never start native queries. Snapshots expire
500 ms after query start by default; pause, failure, and detected foreground
changes invalidate them. Foreground changes between refreshes can remain cached
until expiry. No Phase 2 snapping algorithm or polling loop is added to the app.
Query settings have schemas/defaults in packages/core/config.

## Measurement and manual coverage

Run `pnpm native:ui-probe`. The probe checks permission, keeps the global pause
hotkey, and issues non-overlapping queries every 500 ms. It prints cursor,
foreground app, elements, elapsed milliseconds, and rolling p50/p95 over up to
1,000 successful samples. Timing includes the wrapper, cursor lookup, and both
foreground checks; failed/timed-out queries are printed separately and must be
counted when reporting coverage. Cold startup is included. Ctrl+C exits.

Target: p95 below 15 ms on both operating systems. No live latency or application
coverage is claimed from mock tests, compilation, or CI smoke checks. Collect at
least 100 successful samples per app, record failure/empty-query counts, and
check all eight role types, disabled/offscreen controls, foreground switching,
pause/resume, Retina/125%/150% scaling, and permission denied/granted.

| OS | app | element types found | problems |
| --- | --- | --- | --- |

## P2.6 poor-coverage policy

In the coverage table above, use `macOS` or `Windows` for OS and the exact
native-probe app ID for app: bundle ID on macOS, process filename including
`.exe` on Windows. Windows filenames are compared without case sensitivity.
To disable snapping automatically, start the problems cell with `poor:` followed
by the reason (a standalone `poor` also disables it). Other problem descriptions
do not imply a poor rating. Invalid explicit poor rows fail the build.

The desktop main bundle derives its poor-app registry from this document at
build time; the installed app does not need a Markdown file or runtime filesystem
read to decide coverage. Rebuild/restart after changing ratings. Poor coverage
overrides a saved on preference and shows the reason in settings. This table
currently has no app rows: no real app ratings have been invented.

## Sources

- [Microsoft UIA threading guidance](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-threading)
- [Microsoft UIA cache requests](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-cachingforclients)
- [Apple AX hit-test](https://developer.apple.com/documentation/applicationservices/1462077-axuielementcopyelementatposition)
- [Apple AX messaging timeout](https://developer.apple.com/documentation/applicationservices/1459345-axuielementsetmessagingtimeout)
- [napi-rs async tasks](https://napi.rs/docs/concepts/async-task)

Dependency: target-specific `windows` 0.62.2 provides maintained generated COM/UIA
bindings absent from the existing windows-sys C API surface. macOS continues to
use existing core-foundation/core-graphics dependencies. Both platform backends
compile locally; Windows linking and runtime measurements require Windows CI
and the teammate's manual check.
