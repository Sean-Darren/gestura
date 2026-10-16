# 0008: Local pointing benchmark

Date: 2026-10-15
Status: implemented; human measurement pending

Use pure trial/geometry/summary logic in tools/pointing-bench, schemas/defaults in packages/core, and side effects in desktop main. Render the harness within the existing control window; retain sandbox/preload/CSP boundaries. Only the trusted control renderer may send benchmark commands. Small 16/24/32/48 px targets and 20 px cells are the user-requested measurement exception to normal control sizing; setup/pause/delete stay ≥48 px.

Use a stride-six sequence over 13 circular positions for standard targets, and a fixed 30-control replica for realistic selection. Record border-box CSS bounds, device scale, coordinates/button, active trial duration, outcome and actual scalar latency. End each trial at the first selection attempt; timeout is a separate unsuccessful outcome. Exclude pause time and operational controls. Aggregate by exact dimensions, with N/A for absent latency/selection data; never aggregate rolling p50/p95 values.

Collect only after Start. Persist only after explicit Local saving on; write owned session/JSON/Markdown files under userData, replacing the previous saved session. Serialize writes and deletion so Delete cannot be followed by an older queued save restoring data. No external service, export, employee reporting or media capture is added. Tests write only owned temporary directories.

A narrow optional pointer callback passes each successful live capture-to-move-sent scalar latency to the active trial without I/O. The desktop command opens the same pipeline instance using Electron's [documented single-instance lock and second-instance event](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata). This also avoids duplicate cursor injection processes. Native demo/probe tools remain separate developer entrypoints.

CSS px are logical units at 100% browser zoom; device scale is saved for Retina/Windows DPI interpretation. The recorded time includes IPC/render scheduling, not hardware delivery. Initial acquisitions are included; no formal ISO-conformance claim or real-user score is inferred from synthetic tests. Q8/Q9 defaults apply; the human team chooses the baseline product and real cases. No workflow changes or external dependencies.
