# 0009: Cached click-time target snapping

Date: 2026-10-15
Status: implemented; live AX/UIA coverage, accuracy and latency validation pending

## Selection

Use pure packages/pointer/src/snap.ts. Coordinates and the initial 60 px radius are physical pixels, matching the filtered pointer pipeline. Eligibility uses distance to rectangle bounds, semantic clickability, enabled/on-screen state and a maximum 300 px on either dimension. Native queries cap candidates at 50. Target size is sqrt(width × height), clamped to 16–96 px so broad panes cannot dominate through normalization alone.

Lower scores win: edge distance / capped size, plus 0.1 × center distance / (size + radius), plus optional calibrated-gaze distance bounded at twice the normalization scale, plus a small role prior. Gaze weight is 0.15 by default; omitted/disabled gaze contributes nothing. Default role penalties are button/menu-item/check-box 0, tab/spreadsheet-cell 0.02, link 0.03, edit-field 0.06 and list-item 0.08. Config/defaults live in packages/core/config.

The incumbent persists until another eligible target improves its score by more than 0.2 continuously for at least 100 ms. Losing eligibility clears it immediately; gaps/out-of-order timestamps reset history. Geometry/role keys make selection stable across copied cache snapshots. During a blink the already highlighted candidate is held, while fresh snapshots still validate bounds, label and flags. Moving/disabled/offscreen/renamed targets are not silently replaced while the eyes are closed.

## Integration and safety

Normal native movement always uses the free filtered cursor. Only existing gesture click events ask for a synchronous snap destination; drag down/up remains unchanged. Valid selection moves to its center immediately before the existing native click. Missing/invalid caches fall back to the original blink-frozen/dwell position. No UI invocation APIs, autonomous clicks, ActionGate confirmation paths or generated-text insertion are added.

One non-overlapping background refresh runs at most once per configured 100 ms while fresh live head control exists. Native queries remain on P1.2's dedicated worker. Cursor updates and click dispatch never await or initiate a query. Cached bounds convert Quartz points to physical pixels once per accepted refresh; Windows pixels stay unchanged. The overlay converts physical bounds back to DIP/CSS units and draws an inert highlight. Reserved pause-corner centers and centers outside the primary display are excluded.

Snapshots must be the accepted P1.2 cache object, under 200 ms old from query start, for the same foreground app, and queried within the configured radius of the cursor. Known foreground window/app changes, reset, pause, expiry, query failure and display changes invalidate selection. Late query responses cannot reactivate it after reset. Cached foreground polling has an unavoidable race between refreshes; this does not establish that the window cannot change immediately before OS delivery. Real-provider checks remain necessary. Slow or empty providers simply result in unsnapped clicks.

## Settings and data

Snapping starts off until the user enables an app. A bounded in-memory list shows apps encountered during fresh head control, plus saved preferences. Discovering an app does not write a usage history. Only explicit app-ID booleans are atomically saved in userData/snap-preferences.json; no window titles, accessible names, targets or clicks are persisted by snapping. Save failures remain visible until a successful retry. Exact poor-app rows in ADR 0003 are bundled at build time and force snapping off, even over a saved on preference. The actual coverage table is empty; fixtures are not app ratings.

No new dependency, network access, native platform code, workflow or root command is needed. Existing primary-display/DPI defaults, global pause and gaze-disabled behavior remain intact. Benchmark results do not currently record a snap-setting condition; note it manually when comparing runs. Tests use scripted layouts, native mocks and the existing synthetic landmark jitter replay, not live user accuracy data.
