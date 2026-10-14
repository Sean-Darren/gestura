# Native input addon

`pnpm native:build` creates a Node-API 8 addon for the current platform in
`prebuilds/`. The loader supports `darwin-arm64`, `darwin-x64`, and `win32-x64`.
It loads local binaries only and never downloads anything at runtime.

The CI workflow builds each target on a matching runner and uploads
`gestura-native-<platform>` artifacts. Extract the corresponding `.node` file
into this package's `prebuilds/` directory. Production packaging must include
that file outside the ASAR archive. See the desktop builder configuration.

`pnpm native:demo` runs an Electron developer tool so the global pause hotkey
works while another app has focus. After a five-second countdown, it moves
through the four primary-display corners with a 20-physical-pixel inset.
The sample text proposal is printed but remains pending: the human retained
Q4's voice/mouth confirmation requirement, and those pipelines do not exist.
The countdown never confirms an action.

`pnpm native:bench` measures 1,000 stationary `moveTo` calls, including the
desktop wrapper and addon. It prints nearest-rank p50 and p95 in microseconds.
Scheduling yields occur outside the measured interval so the pause hotkey can
stop the benchmark. Run it manually after granting Accessibility permission.

On macOS, `requestInputPermission()` opens the system Accessibility prompt and
returns the current permission state. Grant access to the process hosting the
addon, then recheck or relaunch. A Node smoke check does not grant permission
to Electron. Windows returns true for permission queries, but Windows UIPI can
still block input into an elevated process; such SendInput failures are errors.

Desktop feature code must use `apps/desktop/src/main/native/`, which validates
arguments, drops calls while paused, releases held buttons on pause, and
requires a fresh single-use ConfirmedAction for text insertion. Raw addon
loading is internal to that wrapper and the non-injecting smoke tool.

Run Rust unit tests without the Node bindings:

```sh
cargo test --manifest-path native/gestura-native/Cargo.toml --no-default-features
cargo clippy --manifest-path native/gestura-native/Cargo.toml -- -D warnings
```

The mock has the identical low-level interface and records calls without
touching the desktop. Platform APIs and coordinate conversion are documented
in `docs/decisions/0002-input-injection.md`.
