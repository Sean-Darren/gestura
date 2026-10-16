# 0006 — First-run calibration and local profiles

Date: 2026-10-14
Step: P2.3

## Interaction and scope

A missing/invalid local profile opens first-run setup automatically when control reports ready. Recalibrate is available afterward. The control window uses the primary display in full-screen mode and restores its previous bounds on completion/cancel. A display change aborts setup rather than applying stale geometry. Closing an active wizard stops capture.

The wizard operates with an internal head-controlled pointer and one-second dwell; it does not inject OS clicks or need the native Accessibility permission to select its controls. Default P2.2 gains and a provisional first-frame neutral pose bootstrap operation. Capturing the formal neutral replaces that provisional offset; measured ranges replace defaults for the quick test. Native input stays disabled during setup. All controls also have keyboard/mouse semantics, and a dwell selection must leave controls before activating another one.

Save and start head control explicitly saves the profile and activates calibrated native head movement when permission is available. Permission denial remains visible in the pointer panel. Camera/Accessibility OS permission dialogs themselves remain a manual setup prerequisite. Settings can turn a fitted gaze mapping off/back on without repeating calibration; enabling without a mapping is rejected.

## Capture screens

1. Framing uses only derived face bounds to warn about centering/size/clipping. The vision process samples a 16×16 in-memory canvas every 500 ms and emits mean luminance only. Pixels never cross IPC or go to disk; the sampled canvas is cleared. Mean luminance below 0.12/above 0.92 triggers dark/bright warnings. These are coarse lighting heuristics, not a camera-quality guarantee.
2. Neutral captures three seconds of suitable centered frames. Motion over a two-degree interquantile span restarts capture. Median angles define neutral.
3. Four five-second direction prompts collect comfortable extrema. The 90th percentile of each signed offset defines independent left/right/up/down ranges; extents under one degree or over 85 degrees are rejected for retry. Mapping normalizes by the selected side's extent after the dead zone, so each comfortable limit reaches its corresponding screen edge. The existing low-center/high-travel curve is retained.
4. Gaze is off by default. When selected, nine points each collect 1.5 seconds of valid iris features. Each point contributes mean eye-local offsets (two axes per eye) and normalized head yaw/pitch. Standardized ridge regression with an unpenalized intercept and lambda 0.001 produces two seven-coefficient normalized-screen transforms. Pivoted elimination supports correlated/constant features. Missing samples or a fit residual above 0.2 normalized units causes a retry/disable route. This residual is a capture sanity check, not a held-out accuracy claim. Only fitted calibration parameters survive saving; per-frame capture buffers remain local/in-memory.
5. Three bilateral deliberate closures must each last at least the Q7 starting 400 ms and no more than three seconds. Ten seconds of valid natural-blink observation follows. Overlapping natural/deliberate duration distributions require retry. Stored score hysteresis comes from observed closed/open quantiles; the long-blink duration threshold is at least 400 ms and strictly above observed natural durations. No click gesture or GenAI confirmation runs here; P2.4 consumes these settings later.
6. Five 96 px targets are selected by fresh head-pointer samples dwelling inside their circles for one second. All five are required before save. These are internal wizard selections, not native clicks.

Capture timers freeze on global pause. Face loss, stale frames or bad lighting restart interrupted timed captures and clear pending blink/dwell intervals. Elapsed wizard duration is wall time including pauses, retries and permission/setup delays. Synthetic tests do not establish the unaided <2 minute onboarding target.

## Persistence and privacy

Main validates the versioned CalibrationProfileSchema and writes userData/calibration-profile.json using a unique temporary file and rename. Reads are bounded to 128 KB; invalid/missing files trigger first run. The schema contains neutral/ranges/filter defaults, gaze coefficients and settings, blink thresholds, display metadata, five successful test selections and duration. No pixels, audio, raw FaceFrame stream or transcripts are saved by calibration.

Total duration is profile metadata. A separate userData/calibration-durations.jsonl is off by default, requires the visible logging opt-in (persisted in the profile), contains only createdAt/durationMs, and can be cleared from control. No logs are exported automatically. Logging failure does not discard a successfully saved profile; profile write failure leaves the wizard in review with an error/retry route. A failed write/rename can leave a private temporary profile file; it contains parameters only.

Existing Q4/ActionGate policy is unchanged. Profile/settings operations do not insert text into another application. Hard rules, Commands and workflows are unchanged. No new external dependencies were added. Live Windows/macOS behavior and real calibration accuracy remain manual checks.
