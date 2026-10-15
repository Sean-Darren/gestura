# Pointing benchmark (P2.5)

Run `pnpm bench:pointing`. It builds and launches the desktop app with the benchmark view open. If the current version of Gestura is already running, the command opens that instance's benchmark, preserving the live pipeline. Restart an older running build once after updating. The same view is available through **Open pointing benchmark** in control.

1. Back to tracking settings: calibrate/start the camera, enable pointer control and choose blink or dwell clicks. For a physical-input baseline, keep Gestura pointer/click control off. No baseline product is assumed under Q9.
2. Open the benchmark and choose A or B. **Local saving off** is the default. Start explicitly collects trial/click positions and scalar latency in memory; no media or external application content is collected.
3. To write reports, select **Local saving on before starting**. Finishing all trials or choosing End session writes `session.json` (raw trials/samples), `summary.json` and `summary.md` to the app's `userData/pointing-bench` folder. The success message shows the absolute folder. Each run replaces the previous saved run; copy results locally yourself before comparing runs. No automatic export/upload exists.
4. **Delete local results** removes those owned files and in-memory results. Persistence errors are visible. A failed save may leave a subset of files; Delete clears those too.

## Protocol

A uses 13 positions around a circle at each of 16, 24, 32 and 48 CSS px. The deterministic stride-six sequence alternates near-opposite positions. All 13 positions are visible; the active square is dark green. The initial acquisition at each size is included. This is an ISO 9241-9-style task, not a certified standards-conformance study.

B uses 30 fixed controls: six toolbar icons, three menus, three tabs, two links and sixteen 68×20 px spreadsheet cells. These are inert replicas; selecting Save/Print etc. never invokes the named operation. Only target selection is measured. Layout is held fixed during a run.

Targets have exact border-box CSS dimensions with no expanded invisible hit area. At 100% browser zoom, CSS px correspond to logical display units. Physical extent is CSS size × recorded device scale (Retina 2:1, Windows DPI/zoom dependent). Reports record dimensions and scale; do not pool differently scaled runs. The normal setup/pause/delete buttons remain ≥48 px. Benchmark targets are the explicitly requested small-size exception.

Every pointer-button-down attempt outside session controls ends one trial. A hit is inside the active target's half-open bounds; elsewhere, including benchmark header/background, is a miss/false click. Other targets are distractors. Timeout is checked on the 100 ms main timer after 30 seconds of active time; incoming clicks received before that callback are still logged. Timeout counts as an unsuccessful trial with no false click. End session, focus loss, resize, display changes and closing control end a partial session; the unfinished current trial is excluded. Session controls and the global pause corner are operational actions, excluded from selection counts.

Global pause excludes paused duration and suppresses selection/latency capture, while retaining the existing head-resume corner. No benchmark logic injects input. Trial time begins in main when the target is dispatched, includes IPC/render scheduling, and ends when main receives selection. It is not a hardware click-to-photon measure. No artificial latency samples are generated: actual successful live native moves contribute capture-to-move-sent latency to the active trial; replay, disabled, idle and paused input do not contribute. Sample buffers cap at 20,000/trial and report dropped counts.

## Summary definitions

- Hit rate = hits / completed trials, including timeouts in the denominator.
- False-click rate = misses / button-down selection attempts; timeouts excluded. Zero click attempts reports N/A.
- Selection time = active time through successful selection; median uses the arithmetic mean of the middle pair for an even count. Misses/timeouts remain in raw trials.
- Latency p50/p95 = nearest-rank percentiles of individual capture-to-move-sent samples, before OS delivery. Missing data reports N/A.
- Group by mode and exact width×height. Standard squares display a single size; realistic rows retain width×height. No percentiles of percentiles and no pooled device scales.

Synthetic tests cover geometry, full deterministic completion (52/30 trials), hits/misses/timeouts, pauses, sample limits/attribution, metrics, opt-in writing and deletion ordering. They are not real Gestura performance measurements. Run both modes manually on macOS and Windows with the same scaling and input conditions before interpreting accuracy/latency targets.
